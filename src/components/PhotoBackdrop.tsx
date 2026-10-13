import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { Photo } from '../data/photos';
import { PARALLAX_RANGE } from './motion';

/**
 * A decorative photograph filling its nearest positioned ancestor, for section
 * backgrounds (portal headers, the sign-in page). Give the parent `relative
 * overflow-hidden`, put a scrim over this, and never set text on it unscrimmed.
 * Hidden from assistive technology: it is atmosphere, not content.
 *
 * The image sits on its own layer that bleeds 10% above and below the frame.
 * With `parallax`, that layer drifts from 6% of its height above centre to 6%
 * below as the frame crosses the screen, so the photo moves a little slower than
 * the page and reads as further away. 6% of the layer is 7.2% of the frame,
 * inside the 10% bleed, so an edge never shows. Each photo's `position` was
 * chosen with the bleed in place, so it stays correct while the layer moves.
 * Under prefers-reduced-motion the layer stays still.
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
  parallax?: boolean;
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
        <ParallaxLayer>{image}</ParallaxLayer>
      ) : (
        <div className="absolute inset-x-0 inset-y-[-10%]">{image}</div>
      )}
    </div>
  );
}

/**
 * Its own component so a static backdrop never subscribes to scroll. The frame
 * (the layer's parent) is the scroll target; its progress runs from 0 as its top
 * meets the bottom of the screen to 1 as its bottom leaves the top. The offset
 * lives in a motion value, so scrolling never re-renders React.
 */
function ParallaxLayer({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${PARALLAX_RANGE}%`, `${PARALLAX_RANGE}%`]);

  return (
    // The measuring box is the full frame; the layer inside it is the one that moves.
    <div ref={frameRef} className="absolute inset-0">
      <motion.div style={{ y, willChange: 'transform' }} className="absolute inset-x-0 inset-y-[-10%]">
        {children}
      </motion.div>
    </div>
  );
}
