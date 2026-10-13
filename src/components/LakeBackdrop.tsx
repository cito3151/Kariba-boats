import { lakeWashSrc } from '../data/photos';

/**
 * The layered background of the pale page areas: the portal content under every
 * PortalHeader (drawn once, in PortalPage) and the landing page's sections
 * between the hero and the departures band. A page background never reads as a
 * flat fill. Put it as the first child of a `relative isolate` wrapper; it fills
 * the wrapper behind everything else in it.
 *
 * Bottom to top:
 * 1. lake-50, the page colour.
 * 2. A soft photo of a boat on open water (lakeWashSrc, blurred by the CDN) at
 *    60%. It holds still against the screen while the content scrolls over it,
 *    the way MSC sets its pale bands on a photo: a sticky layer as tall as the
 *    largest viewport (lvh, so a phone hiding its toolbars never shows a strip
 *    below it), inside a box that clips rather than scrolls (overflow: clip, so
 *    sticky still follows the page), which keeps it within this area.
 *    Sticky, not fixed: the page transition moves its wrapper with a transform,
 *    which would turn a fixed layer into one the height of the whole page for
 *    the first 0.3s. The image is plain and pre-blurred, so scrolling only moves
 *    a layer and never repaints it.
 * 3. A wash from white at 50% at the top to lake-50 at 35% at the foot, so the
 *    page reads lit from above and the photo stays a hint, not a picture.
 * 4. The shared water texture in lake-600 at 12%.
 *
 * Contrast, worked from the photo's darkest pixel, rgb(155 162 162), with a
 * texture stroke behind the text: lake-700 is 4.9:1 at worst and 5.5:1 near the
 * top, lake-950 far above that. Text set straight on this background is lake-700
 * or darker; lake-600 can drop to 3.7:1 on a stroke, so it stays on white cards
 * (6.4:1 there), which this does not touch.
 */
export default function LakeBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-clip bg-lake-50">
      <div className="sticky top-0 h-lvh w-full">
        <img
          src={lakeWashSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-center opacity-60"
        />
      </div>
      <div className="absolute inset-0 bg-linear-to-b from-white/50 to-lake-50/35" />
      <div className="absolute inset-0 water-texture bg-lake-600/12" />
    </div>
  );
}
