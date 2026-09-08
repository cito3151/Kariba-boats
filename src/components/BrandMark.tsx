import logoUrl from '../assets/kariba connect logo.png';

// The source logo is a square lockup: the sun/boat/waves emblem sits in the upper
// area with the "Kariba Lake Connect" wordmark beneath it. In the app chrome the
// wordmark is already set in live text next to the mark, so we window in on just
// the emblem rather than shipping the tiny, unreadable wordmark twice.
const EMBLEM = {
  left: 0.14, // fraction of the square where the emblem starts, horizontally
  top: 0.15,
  width: 0.72,
  height: 0.5,
};

/**
 * The Kariba Lake Connect emblem, cropped out of the full logo lockup.
 * `height` is the rendered height in pixels; width follows the emblem's aspect.
 */
export default function BrandMark({ height = 36, className = '' }: { height?: number; className?: string }) {
  const scale = height / EMBLEM.height;

  return (
    <span
      className={`block shrink-0 overflow-hidden ${className}`}
      style={{ height, width: scale * EMBLEM.width }}
    >
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        style={{
          width: scale,
          height: scale,
          maxWidth: 'none',
          marginLeft: -scale * EMBLEM.left,
          marginTop: -scale * EMBLEM.top,
        }}
      />
    </span>
  );
}

/** The full logo lockup, emblem plus wordmark. For splash and auth surfaces. */
export function BrandLockup({ className = '' }: { className?: string }) {
  return <img src={logoUrl} alt="Kariba Lake Connect" className={className} />;
}
