import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import PortalPage from '../portal/PortalPage';
import { portalPhotos } from '../../data/photos';

/**
 * The frame shared by the hotel and travel agency portals: PortalPage with the
 * breadcrumb root fixed. Both portals are a single page that books boats on
 * someone else's behalf, so they differ only in eyebrow and icon, which the page
 * passes in. No tabs: a portal with one section has nothing to switch between.
 */
export default function PartnerPortalPage({
  eyebrow, icon, title, subtitle, actions, children,
}: {
  /** "Hotel portal" or "Travel agency portal"; also the current breadcrumb. */
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PortalPage
      eyebrow={eyebrow}
      icon={icon}
      photo={portalPhotos.partner}
      title={title}
      subtitle={subtitle}
      actions={actions}
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: eyebrow }]}
    >
      {children}
    </PortalPage>
  );
}
