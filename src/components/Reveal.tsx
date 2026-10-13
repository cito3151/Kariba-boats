import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export default function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      // Reduced motion keeps the reveal, but takes out the travel: the content
      // still arrives as the reader reaches it, it just no longer slides up the
      // screen. A cross-fade carries the same "this is new" signal without the
      // vestibular cost, which is what the setting is actually asking for.
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={
        reduce
          ? { duration: 0.25, delay }
          : { type: 'spring', bounce: 0, duration: 0.55, delay }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}
