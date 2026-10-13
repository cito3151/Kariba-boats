/**
 * Scrolls to the results section. Reduced motion gets an instant jump, matching
 * the booking bar button above the fold.
 */
export function scrollToBoats(reduceMotion: boolean | null) {
  document.getElementById('boats')?.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}
