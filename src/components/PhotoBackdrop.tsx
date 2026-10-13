import type { Photo } from '../data/photos';

/**
 * A decorative photograph filling its nearest positioned ancestor, for section
 * backgrounds (portal headers, the sign-in page). Give the parent `relative
 * overflow-hidden`, put a scrim over this, and never set text on it unscrimmed.
 * Hidden from assistive technology: it is atmosphere, not content.
 *
 * Built for scroll parallax but static for now: the image sits on its own layer,
 * marked `data-parallax-layer`, that bleeds 10% above and below the frame, so an
 * effect can translate that layer by up to 10% of the frame's height either way
 * without exposing an edge. Each photo's `position` was chosen with the bleed in
 * place, so it stays correct once the layer moves.
 *
 * `priority` is for a photo at the top of the page (the header band, the sign-in
 * backdrop): it loads eagerly at high fetch priority. Everything else is lazy.
 */
export default function PhotoBackdrop({
  photo,
  sizes = '100vw',
  priority = false,
  position,
  className = '',
}: {
  photo: Photo;
  sizes?: string;
  priority?: boolean;
  /** Overrides the photo's own object-position class for this slot. */
  position?: string;
  className?: string;
}) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div data-parallax-layer className="absolute inset-x-0 inset-y-[-10%]">
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
      </div>
    </div>
  );
}
