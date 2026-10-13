import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { Photo } from '../data/photos';
import { PARALLAX_RANGE } from './motion';

/**
 * How a parallax photo is driven by the scroll.
 * - `band`: a band part-way down the page (the departures band). The photo runs
 *   from PARALLAX_RANGE above centre, as the band's top meets the foot of the
 *   screen, to PARALLAX_RANGE below, as its bottom leaves the top.
 * - `top`: a backdrop at the very top of the page (a portal header, the sign-in
 *   page). It is already on screen at load, so measured like a band it would
 *   open part-way through its travel, about 10px below the crop chosen in
 *   photos.ts. Here it sits exactly on that crop with the page at the top, and
 *   drifts down by PARALLAX_RANGE as the frame scrolls away.
 */
export type ParallaxMode = 'band' | 'top';

/**
 * A decorative photograph filling its nearest positioned ancestor, for section
 * backgrounds (portal headers, the sign-in page). Give the parent `relative
 * overflow-hidden`, put a scrim over this, and never set text on it unscrimmed.
 * Hidden from assistive technology: it is atmosphere, not content.
 *
 * The image sits on its own layer that bleeds 10% above and below the frame.
 * With `parallax`, that layer drifts as the page scrolls (see ParallaxMode), so
 * the photo moves a little slower than the page and reads as further away. 6% of
 * the layer is 7.2% of the frame, inside the 10% bleed, so an edge never shows.
 * Each photo's `position` was chosen with the bleed in place and the layer at
 * rest, which is where both modes hold it with the frame centred (`band`) or the
 * page at the top (`top`). Under prefers-reduced-motion the layer stays still.
 *
 * `priority` is for a photo at the top of the page (the header band, the sign-in
 * backdrop): it loads eagerly at high fetch priority. Everything else is lazy.
 */
export default function PhotoBackdrop({
  photo,
  sizes = '100vw',
  priority = false,
  parallax = false,
  position,
  className = '',
}: {
  photo: Photo;
  sizes?: string;
  priority?: boolean;
  /** Drift the photo against the scroll. Off for small frames such as cards. */
  parallax?: false | ParallaxMode;
  /** Overrides the photo's own object-position class for this slot. */
  position?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  const image = (
    <img
      src={photo.src}
      srcSet={photo.srcSet}
      sizes={sizes}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={`h-full w-full object-cover ${position ?? photo.position} ${photo.mirror ? '-scale-x-100' : ''}`}
    />
  );

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {parallax && !reduce ? (
        <ParallaxLayer mode={parallax}>{image}</ParallaxLayer>
      ) : (
        <div className="absolute inset-x-0 inset-y-[-10%]">{image}</div>
      )}
    </div>
  );
}

/**
 * Its own component so a static backdrop never subscribes to scroll. The frame
 * (the layer's parent) is the scroll target. The offset lives in a motion value,
 * so scrolling never re-renders React. Exported for a photo frame that is not a
 * backdrop (the boat page's header slideshow, through AutoCarousel's `parallax`):
 * put it inside a `relative overflow-hidden` frame, and only when motion is not
 * reduced, as PhotoBackdrop does.
 */
export function ParallaxLayer({ mode, children }: { mode: ParallaxMode; children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: frameRef,
    // band: 0 as the top meets the foot of the screen, 1 as the bottom leaves the top.
    // top: 0 with the frame's top at the top of the screen, 1 as its bottom leaves it.
    offset: mode === 'top' ? ['start start', 'end start'] : ['start end', 'end start'],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    mode === 'top' ? ['0%', `${PARALLAX_RANGE}%`] : [`-${PARALLAX_RANGE}%`, `${PARALLAX_RANGE}%`],
  );

  return (
    // The measuring box is the full frame; the layer inside it is the one that moves.
    <div ref={frameRef} className="absolute inset-0">
      <motion.div style={{ y, willChange: 'transform' }} className="absolute inset-x-0 inset-y-[-10%]">
        {children}
      </motion.div>
    </div>
  );
}
