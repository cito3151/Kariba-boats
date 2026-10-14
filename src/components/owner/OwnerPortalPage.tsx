import type { ReactNode } from 'react';
import { Anchor, Building2, CalendarDays, Gauge, LayoutGrid, Star } from 'lucide-react';
import PortalPage from '../portal/PortalPage';
import { portalPhotos } from '../../data/photos';
import type { Crumb } from '../portal/PortalHeader';
import type { PortalTab } from '../portal/PortalTabs';

const OWNER_TABS: PortalTab[] = [
  // The register and edit forms belong to the boats overview, so it stays lit there.
  { to: '/owner', label: 'Overview', icon: LayoutGrid, activeFor: ['/owner/boats/*'] },
  { to: '/owner/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/owner/maintenance', label: 'Maintenance', icon: Gauge },
  { to: '/owner/reviews', label: 'Reviews', icon: Star },
  { to: '/owner/company', label: 'Company', icon: Building2 },
];

/**
 * The boat owner portal's frame: PortalPage with the owner eyebrow, breadcrumb
 * root and section tabs fixed, so each owner page only names itself. `crumb` is
 * the current page's breadcrumb label; leave it out on the overview, where the
 * portal itself is the current page.
 */
export default function OwnerPortalPage({
  title, crumb, subtitle, actions, children,
}: {
  title: string;
  crumb?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const breadcrumbs: Crumb[] = [
    { label: 'Home', to: '/' },
    crumb ? { label: 'Boat owner portal', to: '/owner' } : { label: 'Boat owner portal' },
    ...(crumb ? [{ label: crumb }] : []),
  ];

  return (
    <PortalPage
      eyebrow="Boat owner portal"
      icon={Anchor}
      photo={portalPhotos.owner}
      title={title}
      subtitle={subtitle}
      actions={actions}
      breadcrumbs={breadcrumbs}
      tabs={OWNER_TABS}
      tabsLabel="Boat owner portal sections"
    >
      {children}
    </PortalPage>
  );
}
