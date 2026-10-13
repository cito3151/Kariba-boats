import { useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Reveal from '../Reveal';
import { canObserve, revealSpring } from '../motion';

/**
 * A titled block of content inside a portal page: an uppercase heading on a navy
 * rule, the same grammar as the landing page's section titles, with an optional
 * description and actions on the right. Use it for each distinct part of a page
 * (Your boats, Proof of company ownership); do not use it for headings inside a
 * card, which keep the card's own h2/h3.
 *
 * As the section scrolls into view (on load for a section already on screen) the
 * heading rises in and its rule draws across from the left, a beat behind it.
 * The content brings its own entrance when its data arrives. Under reduced
 * motion the heading only fades and the rule is simply there.
 */
export default function PortalSection({
  title, description, actions, children, className = '',
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  const reduce = useReducedMotion();

  return (
    <section aria-labelledby={headingId} className={className}>
      <Reveal y={20} className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h2 id={headingId} className="break-words text-lg font-extrabold uppercase tracking-[0.04em] text-lake-950 sm:text-xl">
            {title}
          </h2>
          {description && <p className="mt-1 text-[15px] leading-normal text-lake-700">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </Reveal>
      {/* The rule, drawn with scaleX from its left end: transform only. */}
      <motion.div
        aria-hidden
        initial={reduce || !canObserve ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ ...revealSpring, duration: 0.8, delay: 0.1 }}
        className="h-0.5 origin-left bg-lake-950"
      />
      <div className="mt-4">{children}</div>
    </section>
  );
}
