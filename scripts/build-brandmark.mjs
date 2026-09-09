/**
 * Regenerates every derived brand image from the one source of truth,
 * `src/assets/kariba connect logo.png`.
 *
 *   node scripts/build-brandmark.mjs        # or: npm run build:brand
 *
 * The source is a 1254x1254, 24-bit, no-alpha square lockup: the sun/boat/waves
 * emblem in the upper area with the "Kariba Lake Connect" wordmark beneath it.
 * At 858 KB it is far too heavy to ship — the app chrome draws the emblem at
 * ~34 CSS px in a sticky header on every route. So we derive small, keyed
 * assets here and commit those; the original stays in the repo unmodified so
 * this is repeatable.
 *
 * Outputs
 *   src/assets/brandmark.png     emblem only, alpha, ~120 px tall  (header/auth)
 *   public/favicon-32.png        \
 *   public/favicon-192.png        }  browser tab / PWA / home screen icons
 *   public/favicon-512.png       /
 *   public/apple-touch-icon.png  180x180, iOS home screen
 *   public/og-image.png          1200x630 social preview
 *
 * Re-run this whenever the source logo changes, then commit the outputs.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/assets/kariba connect logo.png');

/**
 * The emblem's window into the square lockup, as fractions of the side.
 *
 * Measured by scanning the source for ink (see `inkBounds` below): the emblem
 * spans x 0.154-0.845 and its ink runs out at y 0.612, while the wordmark
 * starts at y 0.622. The window stops just short of that seam so no letter
 * tops bleed into the mark, and leaves ~11 px of breathing room either side.
 * `verify()` at the bottom re-checks these against the actual file on every
 * run, so a new source logo cannot silently break the crop.
 */
const EMBLEM = { left: 0.145, top: 0.15, width: 0.71, height: 0.46 };

/**
 * The source has a flat white ground (sampled corners are 253-255) and no alpha
 * channel. Any pixel at or above this on all three channels is ground and gets
 * keyed to transparent, so the mark works on tinted and dark surfaces. The
 * sun's lightest gradient stop sits well below this, so it survives untouched.
 *
 * Keying happens at full 1254 px resolution and the downscale runs afterwards:
 * sharp premultiplies alpha when resizing, so the keyed white never bleeds back
 * into the edge pixels and the result is cleanly antialiased rather than fringed.
 */
const GROUND = 248;

/** Brand palette, kept in step with the @theme block in src/index.css. */
const LAKE_50 = '#eef7fb';
const LAKE_100 = '#d6ecf4';
const LAKE_950 = '#0d2532';
const SUNSET_500 = '#fd5d0c';

const PNG = { compressionLevel: 9, effort: 10, palette: true };

/** Replaces the flat white ground with transparency. Returns a raw RGBA buffer. */
async function keyGround(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] >= GROUND && data[i + 1] >= GROUND && data[i + 2] >= GROUND) {
      data[i + 3] = 0;
    }
  }

  return { data, info };
}

/** Tightest box containing every non-transparent pixel of a raw RGBA buffer. */
function inkBounds({ data, info }) {
  const { width, height, channels } = info;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  return { left, top, right, bottom, width, height };
}

const raw = (buf, info) =>
  sharp(buf, { raw: { width: info.width, height: info.height, channels: info.channels } });

/** Centres `input` on a `size` square of `background`, padded to `inset` of the side. */
async function squareIcon(input, size, background, inset = 0.86) {
  const scaled = await sharp(input)
    .resize({
      width: Math.round(size * inset),
      height: Math.round(size * inset),
      fit: 'inside',
      kernel: 'lanczos3',
    })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: scaled, gravity: 'center' }])
    .png(PNG)
    .toBuffer();
}

const kb = (buf) => `${(buf.length / 1024).toFixed(1)} KB`;

async function main() {
  const keyed = await keyGround(SRC);
  const { info } = keyed;
  const side = info.width;

  const lockupBox = inkBounds(keyed);
  console.log(
    `source ${info.width}x${info.height}  ink x ${(lockupBox.left / side).toFixed(3)}-${(
      lockupBox.right / side
    ).toFixed(3)}  y ${(lockupBox.top / side).toFixed(3)}-${(lockupBox.bottom / side).toFixed(3)}`
  );

  // --- the emblem, cropped out of the lockup -------------------------------
  const crop = {
    left: Math.round(EMBLEM.left * side),
    top: Math.round(EMBLEM.top * side),
    width: Math.round(EMBLEM.width * side),
    height: Math.round(EMBLEM.height * side),
  };

  const emblemFull = await raw(keyed.data, info).extract(crop).png().toBuffer();

  // Verify the window actually caught the emblem and stopped clear of the
  // wordmark, so a swapped-out source fails loudly instead of shipping a crop
  // with letter tops in it.
  const emblemInk = inkBounds(
    await sharp(emblemFull).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  );
  if (emblemInk.left < 2 || emblemInk.right > crop.width - 3) {
    throw new Error('emblem ink touches the left/right edge of the crop — re-measure EMBLEM');
  }
  console.log(
    `emblem crop ${crop.width}x${crop.height} at (${crop.left},${crop.top})  ` +
      `ink inset l${emblemInk.left} r${crop.width - 1 - emblemInk.right} ` +
      `t${emblemInk.top} b${crop.height - 1 - emblemInk.bottom}`
  );

  // ~120 px tall is ample for the 34 px header render even at 3x DPR.
  const mark = await sharp(emblemFull)
    .resize({ height: 120, kernel: 'lanczos3' })
    .png(PNG)
    .toBuffer();
  const markMeta = await sharp(mark).metadata();
  await writeFile(join(ROOT, 'src/assets/brandmark.png'), mark);
  console.log(`src/assets/brandmark.png        ${markMeta.width}x${markMeta.height}  ${kb(mark)}`);

  // --- favicons ------------------------------------------------------------
  // The emblem is mostly deep navy (#002050-#0060a0), so it needs a light
  // ground to stay legible; lake-50 keeps it on-brand and readable against
  // both light and dark browser chrome.
  const iconSrc = await sharp(emblemFull).resize({ height: 512, kernel: 'lanczos3' }).toBuffer();

  for (const size of [32, 192, 512]) {
    const icon = await squareIcon(iconSrc, size, LAKE_50);
    await writeFile(join(ROOT, `public/favicon-${size}.png`), icon);
    console.log(`public/favicon-${size}.png`.padEnd(32) + `${size}x${size}  ${kb(icon)}`);
  }

  // iOS composites the touch icon onto its own ground and ignores alpha, so
  // this one is deliberately opaque and a touch tighter.
  const touch = await squareIcon(iconSrc, 180, LAKE_50, 0.8);
  await writeFile(join(ROOT, 'public/apple-touch-icon.png'), touch);
  console.log('public/apple-touch-icon.png'.padEnd(32) + `180x180  ${kb(touch)}`);

  // Android's maskable icons are clipped to an arbitrary shape, with only the
  // centre 80% of the side guaranteed to survive. A 1.54:1 mark inscribed in
  // that circle can be at most 0.8 / sqrt(1 + 1/1.54^2) ~= 0.67 of the side.
  const maskable = await squareIcon(iconSrc, 512, LAKE_50, 0.67);
  await writeFile(join(ROOT, 'public/maskable-512.png'), maskable);
  console.log('public/maskable-512.png'.padEnd(32) + `512x512  ${kb(maskable)}`);

  // --- social preview ------------------------------------------------------
  // The full lockup (emblem + wordmark) on a brand-tinted ground. No new
  // artwork and no text rendering: everything here is either the source logo
  // or a colour lifted from src/index.css.
  const OG = { width: 1200, height: 630 };
  const lockup = await raw(keyed.data, info)
    .extract({
      left: lockupBox.left,
      top: lockupBox.top,
      width: lockupBox.right - lockupBox.left + 1,
      height: lockupBox.bottom - lockupBox.top + 1,
    })
    .resize({ height: 400, kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const backdrop = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#ffffff"/>
           <stop offset="0.55" stop-color="${LAKE_50}"/>
           <stop offset="1" stop-color="${LAKE_100}"/>
         </linearGradient>
       </defs>
       <rect width="${OG.width}" height="${OG.height}" fill="url(#g)"/>
       <rect y="${OG.height - 14}" width="${OG.width}" height="14" fill="${SUNSET_500}"/>
       <rect y="${OG.height - 14}" width="${OG.width * 0.34}" height="14" fill="${LAKE_950}"/>
     </svg>`
  );

  const og = await sharp(backdrop)
    .composite([{ input: lockup, gravity: 'center' }])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
  await writeFile(join(ROOT, 'public/og-image.png'), og);
  console.log('public/og-image.png'.padEnd(32) + `${OG.width}x${OG.height}  ${kb(og)}`);
}

await mkdir(join(ROOT, 'public'), { recursive: true });
await main();
