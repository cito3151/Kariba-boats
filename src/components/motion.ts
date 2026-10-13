import { useRef } from 'react';
import { useAnimationControls, useReducedMotion } from 'framer-motion';
import type { TargetAndTransition, Variants } from 'framer-motion';

/**
 * The house entrance: a critically damped spring (no overshoot, because nothing
 * the reader did threw it) that settles in about 0.6s. Shared by the scroll
 * reveals, the header rise and the dashboard lists, so every entrance on the
 * site moves at the same pace.
 */
export const revealSpring = { type: 'spring', bounce: 0, duration: 0.6 } as const;

/** Under prefers-reduced-motion an entrance is this short cross-fade and nothing else. */
export const reducedFade = { duration: 0.2 } as const;

/** Seconds between neighbours that arrive together. */
export const REVEAL_STAGGER = 0.06;

/**
 * The default travel of a reveal, in px: enough to read as "arriving", short
 * enough to stay calm. At 16px the portal cards' rise was lost under the page
 * fade and went unnoticed.
 */
export const REVEAL_TRAVEL = 28;

// A burst of reveals (a row of cards scrolling in together, or everything on
// screen at load) is spread into a wave rather than landing as one block. Each
// reveal asks for its delay at the moment it starts: the first of a burst gets
// none, the next REVEAL_STAGGER, and so on, capped so a long list never makes
// the reader wait. A card that scrolls in on its own starts at once. Spacing by
// arrival rather than by list index means it works for any grid and column
// count, and for items that mount later (a filter change, a reload, a list that
// arrives after its spinner).
const MAX_STAGGER_DELAY = 0.36;
let waveEnd = 0;

export function nextRevealDelay(): number {
  const now = performance.now() / 1000;
  const start = Math.min(Math.max(now, waveEnd), now + MAX_STAGGER_DELAY);
  waveEnd = start + REVEAL_STAGGER;
  return start - now;
}

// Without IntersectionObserver (some old WebViews and test runners) the viewport
// callback never fires, so there a reveal is skipped and its content is simply
// drawn rather than left invisible.
export const canObserve = typeof window !== 'undefined' && 'IntersectionObserver' in window;

export interface RevealOptions {
  /** Starting offset in px. Defaults to REVEAL_TRAVEL upwards (y) and none sideways. */
  x?: number;
  y?: number;
  /** A fixed delay in seconds. Omit to take a place in the current wave. */
  delay?: number;
  /**
   * How much of the element must be on screen before it reveals (0 to 1). By
   * default any part of it, once it is 48px clear of the foot of the screen: a
   * fraction such as 0.2 is never reached by a card more than five screens
   * tall, which would then stay invisible.
   */
  amount?: number;
}

/**
 * Props for any motion element that should rise and fade in once, when it has
 * scrolled into view. Spread them on a motion.div, motion.li, a motion(Link) and
 * so on; Reveal is this hook on a div or li.
 *
 * Content already on screen when it mounts reveals on the first frame the
 * observer reports, so nothing above the fold waits for a scroll, and a card
 * that mounts when its data arrives rises in at that moment. Only transform and
 * opacity move. Under reduced motion there is no travel and no wave, just a
 * short fade.
 */
export function useReveal({ x = 0, y = REVEAL_TRAVEL, delay, amount }: RevealOptions = {}) {
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  // framer-motion calls onViewportEnter again on every re-entry, even with
  // `once`; the reveal itself must only ever run the first time.
  const revealed = useRef(false);

  const initial: TargetAndTransition | false = !canObserve
    ? false
    : reduce ? { opacity: 0 } : { opacity: 0, x, y };

  return {
    initial,
    animate: controls,
    viewport: amount === undefined
      ? { once: true, amount: 'some' as const, margin: '0px 0px -48px 0px' }
      : { once: true, amount },
    onViewportEnter: () => {
      if (revealed.current) return;
      revealed.current = true;
      void controls.start(
        reduce
          ? { opacity: 1, transition: reducedFade }
          : { opacity: 1, x: 0, y: 0, transition: { ...revealSpring, delay: delay ?? nextRevealDelay() } },
      );
    },
  };
}

// Shared entrance choreography for dashboard lists that appear with their data.
// Wrap a container in `staggerContainer` (initial={reduce ? false : 'hidden'}
// animate="show") and give each child `staggerItem` so items reveal in a natural
// wave. Passing `initial={false}` under reduced motion shows them at once. A card
// that mounts on its own with its data takes `variants={staggerItem}` and the
// same initial and animate itself.
//
// Each item asks the arrival wave above for its delay when it starts, which is
// when the list actually appears (after its spinner, not when the page opened),
// and the wave is capped, so a 200-row log does not cascade for twelve seconds.

export const staggerContainer: Variants = {
  hidden: {},
  show: {},
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: REVEAL_TRAVEL },
  show: () => ({ opacity: 1, y: 0, transition: { ...revealSpring, delay: nextRevealDelay() } }),
};

// A single element that rises into view once (for section blocks, not lists).
export const riseIn: Variants = {
  hidden: { opacity: 0, y: REVEAL_TRAVEL },
  show: { opacity: 1, y: 0, transition: revealSpring },
};

/**
 * Props for the box holding one view of a page whose views switch in place (the
 * admin panel's StatTile row), inside AnimatePresence mode="wait" and keyed by
 * the view. The old view fades out quickly and the new one fades in while its
 * heading and cards bring their own rise, so the switch reads as one view
 * settling in place of the other. Opacity only, so it holds under reduced motion.
 */
export const viewSwap = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
} as const;

/**
 * Props for a loading indicator. It waits 150ms before fading in, so a quick
 * response never flashes a spinner, and the content that replaces it fades and
 * rises in, so the hand-over reads as a fade rather than a hard swap.
 */
export const loadingFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.2, delay: 0.15 },
} as const;

/**
 * Props for something that is on screen the moment its page opens (a page
 * title, the hero headline): it rises on mount rather than waiting for the
 * observer. `delay` places it in the opening sequence.
 */
export function riseOnMount(reduce: boolean | null, delay = 0, y = REVEAL_TRAVEL) {
  return {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { ...reducedFade, delay: delay / 2 } : { ...revealSpring, delay },
  };
}

/**
 * How far a parallax photo travels across its frame, as a percentage of the
 * photo layer. PhotoBackdrop's layer bleeds 10% of the frame above and below,
 * which is 8.3% of the layer's own height; 6% of the layer (7.2% of the frame)
 * leaves a margin, so an edge never shows. A band mid-page travels this far
 * either side of centre; a backdrop at the top of the page starts at centre and
 * travels it downwards only.
 */
export const PARALLAX_RANGE = 6;
