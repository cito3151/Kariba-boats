import { motion } from 'framer-motion';
import type { ComponentProps, ReactNode } from 'react';
import { useReveal, type RevealOptions } from './motion';

type PassThrough = Omit<ComponentProps<typeof motion.div>, 'initial' | 'animate' | 'viewport' | 'onViewportEnter' | 'children'>;

/**
 * Rises and fades its content in once, as it scrolls into view (see useReveal
 * for the rules). `as="li"` for a list item. Other motion props, such as
 * `layout` and `exit` for a card in an AnimatePresence list, pass through.
 *
 * Reduced motion keeps the reveal, but takes out the travel: the content still
 * arrives as the reader reaches it, it just no longer slides across the screen.
 * A cross-fade carries the same "this is new" signal without the vestibular
 * cost, which is what the setting is actually asking for.
 */
export default function Reveal({
  children,
  as = 'div',
  delay,
  x,
  y,
  amount,
  ...rest
}: RevealOptions & PassThrough & {
  children: ReactNode;
  as?: 'div' | 'li';
}) {
  const reveal = useReveal({ delay, x, y, amount });
  const Component = (as === 'li' ? motion.li : motion.div) as typeof motion.div;

  return (
    <Component {...rest} {...reveal}>
      {children}
    </Component>
  );
}
