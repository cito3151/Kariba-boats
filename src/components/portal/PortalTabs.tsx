import { useEffect, useRef } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface PortalTab {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** Extra route patterns that also mark this tab active, e.g. '/owner/boats/*'. */
  activeFor?: string[];
}

/**
 * The horizontal section bar under a PortalHeader: one tab per top-level section
 * of a portal, the current one underlined in orange the way the site header marks
 * its active link. On a phone the row scrolls sideways inside its own container,
 * so the page itself never scrolls horizontally, and the active tab is scrolled
 * into view on arrival. Use it for sibling sections of one portal; for drilling
 * into a single record use the breadcrumb instead.
 *
 * Tabs match their own path exactly, so '/owner' is not active on '/owner/company';
 * pages that belong to a section without being its path (a boat's edit form under
 * the boats overview) are listed in `activeFor`. That rule is why these are Links
 * with their own aria-current rather than NavLinks, whose active state cannot be
 * extended to other paths.
 */
export default function PortalTabs({ tabs, label }: { tabs: PortalTab[]; label: string }) {
  const { pathname } = useLocation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  const isActive = (tab: PortalTab) =>
    Boolean(matchPath({ path: tab.to, end: true }, pathname))
    || (tab.activeFor ?? []).some((pattern) => Boolean(matchPath(pattern, pathname)));

  // Only the scroller moves, never the page: scrollIntoView would also scroll
  // the window vertically if the bar were partly off screen.
  useEffect(() => {
    const box = scrollerRef.current;
    const el = activeRef.current;
    if (!box || !el) return;
    const boxRect = box.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.left < boxRect.left || elRect.right > boxRect.right) {
      box.scrollLeft += elRect.left - boxRect.left - 16;
    }
  }, [pathname]);

  return (
    <div className="border-b border-lake-100 bg-white">
      <nav aria-label={label} className="mx-auto max-w-6xl">
        <div ref={scrollerRef} className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex min-w-max gap-5 px-4 sm:gap-8 sm:px-6">
            {tabs.map((tab) => {
              const active = isActive(tab);
              return (
                <li key={tab.to} className="flex">
                  <Link
                    ref={active ? activeRef : undefined}
                    to={tab.to}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex h-12 items-center gap-2 whitespace-nowrap text-[15px] font-semibold outline-none transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lake-500 ${
                      active
                        ? 'text-lake-950 after:bg-sunset-500'
                        : 'text-lake-700 after:bg-transparent hover:text-lake-950 hover:after:bg-lake-200'
                    }`}
                  >
                    {/* Icons only from sm up: without them the four owner tabs fit a
                        375px screen without scrolling. */}
                    {tab.icon && <tab.icon size={16} className="hidden shrink-0 sm:block" aria-hidden />}
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
}
