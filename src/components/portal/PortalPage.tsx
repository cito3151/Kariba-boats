import type { ReactNode } from 'react';
import PageTransition from '../PageTransition';
import PortalHeader, { type PortalHeaderProps } from './PortalHeader';
import PortalTabs, { type PortalTab } from './PortalTabs';

/**
 * The whole frame of a signed-in portal page: the navy PortalHeader band, the
 * PortalTabs section bar when the portal has more than one section, then the page
 * content in the same max-w-6xl column the site header uses, on the lake-50 page
 * background so PortalSection blocks and `portalCard` cards stand out. It carries
 * the page transition, so a page built on it does not wrap itself in one.
 *
 * The content area is never a flat fill: under the tab bar a white wash fades
 * into the page's own lake-50 and water texture (drawn by Layout), so the top of
 * the page reads lit and the content sits on a surface with some depth. Both
 * layers stay paler than lake-50 plus 5% lake-600, where lake-600 text is still
 * 5.3:1.
 *
 * Give each portal one thin wrapper that fixes its eyebrow, breadcrumb root and
 * tabs (see OwnerPortalPage), and build that portal's pages on the wrapper.
 */
export default function PortalPage({
  tabs, tabsLabel, children, ...header
}: PortalHeaderProps & {
  tabs?: PortalTab[];
  /** Accessible name of the tab bar, e.g. "Boat owner portal sections". */
  tabsLabel?: string;
  children: ReactNode;
}) {
  return (
    <PageTransition>
      <PortalHeader {...header} />
      {tabs && tabs.length > 1 && <PortalTabs tabs={tabs} label={tabsLabel ?? `${header.eyebrow} sections`} />}
      <div className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-linear-to-b from-white/80 to-transparent" />
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </div>
    </PageTransition>
  );
}
