import { useId, type ReactNode } from 'react';
import Reveal from '../Reveal';

/**
 * A titled block of content inside a portal page: an uppercase heading on a navy
 * rule, the same grammar as the landing page's section titles, with an optional
 * description and actions on the right. Use it for each distinct part of a page
 * (Your boats, Proof of company ownership); do not use it for headings inside a
 * card, which keep the card's own h2/h3.
 *
 * The heading and its rule rise in as the section scrolls into view (on load for
 * a section already on screen); the content brings its own entrance, if any.
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

  return (
    <section aria-labelledby={headingId} className={className}>
      <Reveal y={16} className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-lake-950 pb-3">
        <div className="min-w-0">
          <h2 id={headingId} className="break-words text-lg font-extrabold uppercase tracking-[0.04em] text-lake-950 sm:text-xl">
            {title}
          </h2>
          {description && <p className="mt-1 text-[15px] leading-normal text-lake-700">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </Reveal>
      <div className="mt-4">{children}</div>
    </section>
  );
}
