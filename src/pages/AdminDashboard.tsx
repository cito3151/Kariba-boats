import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Anchor, Clock, CheckCircle2, Wrench, CalendarCheck, UserCheck, UserCog, ScrollText, FileText, LifeBuoy, Building2 } from 'lucide-react';
import AdminPortalPage from '../components/admin/AdminPortalPage';
import PortalSection from '../components/portal/PortalSection';
import { portalCard } from '../components/portal/styles';
import StatTile from '../components/StatTile';
import { Figure } from '../components/BookingFigures';
import ApprovalQueue from '../components/admin/ApprovalQueue';
import AdminBookings from '../components/admin/AdminBookings';
import UserVerification from '../components/admin/UserVerification';
import CompanyVerification from '../components/admin/CompanyVerification';
import RoleManagement from '../components/admin/RoleManagement';
import AuditLog from '../components/admin/AuditLog';
import LegalDocuments from '../components/admin/LegalDocuments';
import EmergencyContactsAdmin from '../components/admin/EmergencyContactsAdmin';
import { BOAT_TYPE_LABELS } from '../components/BoatCard';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import { staggerContainer, staggerItem } from '../components/motion';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import * as boats from '../services/boats.service';
import { listAllBookings } from '../services/bookings.service';
import { listOwnersAndHotels, listAllUsers } from '../services/users.service';
import { countCompaniesAwaitingReview } from '../services/companies.service';
import type { OwnerBoat, BoatStatus } from '../services/boats.service';

type View = 'companies' | 'queue' | 'all' | 'live' | 'attention' | 'bookings' | 'users' | 'roles' | 'audit' | 'legal' | 'emergency';

// The PortalSection title for each view. The approval queue titles its own two
// sections (the queue and maintenance attention), so it is not listed.
const VIEW_TITLES: Record<Exclude<View, 'queue'>, string> = {
  all: 'All boats',
  live: 'Live boats',
  attention: 'Boats needing maintenance',
  bookings: 'All bookings',
  users: 'Owner and hotel verification',
  companies: 'Company ownership verification',
  roles: 'Admins and roles',
  audit: 'Activity log',
  legal: 'Legal documents',
  emergency: 'Emergency contacts',
};

const STATUS_CHIP: Record<BoatStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-lake-100 text-lake-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-red-100 text-red-700',
};

function BoatList({ boats: list }: { boats: OwnerBoat[] }) {
  const reduce = useReducedMotion();
  if (list.length === 0) return <EmptyState large title="No boats here" hint="Nothing matches this filter yet." />;
  return (
    <motion.ul variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show" className="space-y-3">
      {list.map((b) => (
        <motion.li variants={staggerItem} key={b.id} className={`${portalCard} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{b.name}</h3>
              <p className="mt-1 break-words text-[15px] leading-normal text-lake-700">
                {BOAT_TYPE_LABELS[b.boatType]} · up to {b.capacity} guests · {b.location}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_CHIP[b.status]}`}>
              {b.status}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-lake-100 pt-3 sm:grid-cols-4">
            <Figure label="Price" valueClassName="text-base tabular-nums text-lake-950">
              {b.pricePerDay != null ? `$${b.pricePerDay}/day` : ''}{b.pricePerHour != null ? ` $${b.pricePerHour}/hour` : ''}
            </Figure>
            <Figure label="Maintenance">{b.maintenanceStatus}</Figure>
            <Figure label="Registration">{b.registrationNumber || 'Not provided'}</Figure>
            <Figure label="Active">{b.isActive ? 'yes' : 'no'}</Figure>
            <Figure label="Safety" className="col-span-2 sm:col-span-4">
              {b.safetyEquipment.length ? b.safetyEquipment.join(', ') : 'None listed'}
            </Figure>
          </dl>
          {b.status === 'approved' && (
            <Link to={`/boats/${b.id}`} className="mt-3 inline-block rounded-sm py-1 text-[15px] font-semibold text-lake-700 underline underline-offset-2 outline-none hover:text-lake-900 focus-visible:ring-2 focus-visible:ring-lake-500">
              View public listing
            </Link>
          )}
        </motion.li>
      ))}
    </motion.ul>
  );
}

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const { data: boatData, loading, error, reload } = useAsync(() => boats.listBoatsForAdmin(), []);
  const { data: bookingData } = useAsync(listAllBookings, []);
  const { data: userData } = useAsync(listOwnersAndHotels, []);
  const isSuper = currentUser?.isSuperAdmin ?? false;
  const { data: allUsers } = useAsync(
    () => (isSuper ? listAllUsers() : Promise.resolve([])), [isSuper],
  );
  // A count, not the queue: listCompaniesForReview reads every verification document
  // on the platform, which is a lot to download for one tile an admin may never open.
  const {
    data: companiesAwaiting, reload: reloadCompanyCount,
  } = useAsync(countCompaniesAwaitingReview, []);
  const [view, setView] = useState<View>('queue');

  const list = boatData ?? [];
  const activeBookings = (bookingData ?? []).filter(
    (b) => b.status === 'requested' || b.status === 'confirmed' || b.status === 'deposit_paid',
  ).length;
  const unverified = (userData ?? []).filter((u) => u.verificationStatus === 'pending').length;

  const tiles: { key: View; label: string; value?: number; icon: typeof Anchor }[] = [
    { key: 'all', label: 'Total boats', value: list.length, icon: Anchor },
    { key: 'queue', label: 'Awaiting review', value: list.filter((b) => b.status === 'pending' || b.pendingChanges).length, icon: Clock },
    { key: 'live', label: 'Live for tourists', value: list.filter((b) => b.status === 'approved' && b.isActive).length, icon: CheckCircle2 },
    { key: 'attention', label: 'Maintenance attention', value: list.filter((b) => b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue').length, icon: Wrench },
    { key: 'bookings', label: 'Active bookings', value: activeBookings, icon: CalendarCheck },
    { key: 'users', label: 'Unverified owners/hotels', value: unverified, icon: UserCheck },
    { key: 'companies', label: 'Company documents', value: companiesAwaiting ?? 0, icon: Building2 },
    { key: 'audit', label: 'Activity log', icon: ScrollText },
    { key: 'emergency', label: 'Emergency contacts', icon: LifeBuoy },
  ];
  if (isSuper) {
    tiles.push({ key: 'roles', label: 'Admins and roles', value: (allUsers ?? []).filter((u) => u.role === 'admin').length, icon: UserCog });
    tiles.push({ key: 'legal', label: 'Legal documents', icon: FileText });
  }

  // The current view's content, or null when it has none to show (the super-admin
  // views for an admin who is not one), in which case no section is drawn.
  const content = (v: Exclude<View, 'queue'>): ReactNode => {
    switch (v) {
      case 'bookings': return <AdminBookings />;
      case 'users': return <UserVerification />;
      case 'companies': return <CompanyVerification onReviewed={reloadCompanyCount} />;
      case 'roles': return isSuper ? <RoleManagement /> : null;
      case 'audit': return <AuditLog />;
      case 'legal': return isSuper ? <LegalDocuments /> : null;
      case 'emergency': return <EmergencyContactsAdmin />;
      default:
        return (
          <>
            {loading && <LoadingState large label="Loading boats" />}
            {error && <ErrorState large message={error} onRetry={reload} />}
            {!loading && !error && (
              <BoatList boats={
                v === 'all' ? list
                  : v === 'live' ? list.filter((b) => b.status === 'approved' && b.isActive)
                  : list.filter((b) => b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue')
              } />
            )}
          </>
        );
    }
  };
  const body = view === 'queue' ? null : content(view);

  return (
    <AdminPortalPage
      title="Platform oversight"
      subtitle="Review new boats and operators, follow every booking, and keep the platform's records in order."
    >
      {/* The tiles are the panel's section switcher (one route, no tab bar). On a
          phone they run as one sideways-scrolling row inside their own container,
          with the next tile peeking in, so the selected section's content is not
          pushed six tile rows down the page; from sm up they wrap into a grid. The
          vertical padding keeps the focus ring clear of the scroller's clip. */}
      <div role="group" aria-label="Admin sections"
        className="-mx-4 -my-1 overflow-x-auto px-4 py-1 sm:m-0 sm:overflow-visible sm:p-0">
        <div className="grid auto-cols-[9.5rem] grid-flow-col gap-3 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {tiles.map((t, i) => (
            <StatTile key={t.key} index={i} label={t.label} value={t.value} icon={t.icon}
              active={view === t.key} onClick={() => setView(t.key)} />
          ))}
        </div>
      </div>

      <div className="mt-10">
        {view === 'queue' && <ApprovalQueue />}
        {view !== 'queue' && body !== null && (
          <PortalSection title={VIEW_TITLES[view]}>{body}</PortalSection>
        )}
      </div>
    </AdminPortalPage>
  );
}
