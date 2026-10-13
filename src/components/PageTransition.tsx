import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export default function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      // The exit mirrors the entry on the same axis, so a page leaves the way it
      // arrived rather than entering from below and leaving sideways.
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: reduce ? 0.18 : 0.28, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
