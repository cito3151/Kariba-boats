// Class strings shared by every signed-in portal page. They are strings rather
// than components so the same card can be a <div>, an <li> or a motion.div with
// its own layout animation, without a wrapper per element type.

/**
 * A white content card: thin border, 8px radius, one restrained shadow. Add the
 * padding at the call site (`p-4 sm:p-5` for most cards, none for a card whose
 * photo runs to the edge, which also wants `overflow-hidden`).
 */
export const portalCard =
  'rounded-lg border border-lake-100 bg-white shadow-[0_1px_2px_rgb(13_37_50/0.06)]';

/**
 * Shape, type and focus ring of every portal button, with no colours, so a
 * variant (a red Delete, say) adds its own without fighting the ones below.
 */
export const portalButtonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 disabled:opacity-50';

/**
 * The one orange action on a page (Register a boat, and the like). Navy text, not
 * white: white on this orange is 3.1:1, navy is 5.1:1. Use it once per view; the
 * rest of the actions take `portalButtonSecondary`.
 */
export const portalButtonPrimary =
  `${portalButtonBase} bg-sunset-500 font-bold text-lake-950 hover:bg-sunset-400`;

/** Outlined action for everything that is not the page's primary action. */
export const portalButtonSecondary =
  `${portalButtonBase} border border-lake-200 bg-white font-semibold text-lake-700 hover:bg-lake-50 hover:text-lake-950`;

/** Outlined destructive action (Delete, Remove). */
export const portalButtonDanger =
  `${portalButtonBase} border border-red-200 bg-white font-semibold text-red-700 hover:bg-red-50 hover:text-red-800`;
