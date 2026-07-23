import type { Variants } from 'framer-motion';

// Shared entrance choreography for dashboard lists and grids. Wrap a container
// in `staggerContainer` (initial="hidden" animate="show") and give each child
// `staggerItem` so items reveal in a natural wave. framer-motion automatically
// respects prefers-reduced-motion for these transforms.

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
};

// A single element that rises into view once (for section blocks, not lists).
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};
