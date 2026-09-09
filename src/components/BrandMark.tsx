import brandMarkUrl from '../assets/brandmark.png';

/**
 * Intrinsic size of brandmark.png. The asset is pre-cropped and background-keyed
 * by scripts/build-brandmark.mjs, which windows the emblem out of the full
 * "kariba connect logo.png" lockup (still the source of truth in src/assets) and
 * keys its flat white ground to transparent. Nothing needs cropping at runtime.
 *
 * Both dimensions are set explicitly rather than leaving width auto, so the
 * sticky header reserves the right box before the image decodes.
 */
const INTRINSIC = { width: 185, height: 120 };
const ASPECT = INTRINSIC.width / INTRINSIC.height;

/**
 * The Kariba Lake Connect emblem — sun, boat and waves, without the wordmark.
 * In the app chrome the wordmark is already set in live text beside the mark.
 *
 * `height` is the rendered height in CSS pixels; the width follows the emblem's
 * aspect ratio.
 */
export default function BrandMark({ height = 36, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      src={brandMarkUrl}
      alt=""
      aria-hidden
      width={INTRINSIC.width}
      height={INTRINSIC.height}
      className={`block shrink-0 ${className}`}
      style={{ height, width: height * ASPECT, maxWidth: 'none' }}
    />
  );
}
