import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import PortalPage from '../portal/PortalPage';

/**
 * The admin panel's frame: PortalPage with the admin eyebrow and breadcrumb root
 * fixed. The panel is one route whose sections are switched by its StatTile row
 * rather than by URL, so there is no tab bar and no per-section crumb: a crumb
 * back to /admin from /admin would be a link that does nothing.
 */
export default function AdminPortalPage({
  title, subtitle, actions, children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PortalPage
      eyebrow="Admin panel"
      icon={ShieldCheck}
      title={title}
      subtitle={subtitle}
      actions={actions}
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Admin panel' }]}
    >
      {children}
    </PortalPage>
  );
}
