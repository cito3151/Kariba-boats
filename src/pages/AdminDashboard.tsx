import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Anchor, Clock, CheckCircle2, Wrench, CalendarCheck, UserCheck, UserCog, ScrollText, FileText } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import DashboardBanner from '../components/DashboardBanner';
import StatTile from '../components/StatTile';
import ApprovalQueue from '../components/admin/ApprovalQueue';
import AdminBookings from '../components/admin/AdminBookings';
import UserVerification from '../components/admin/UserVerification';
import RoleManagement from '../components/admin/RoleManagement';
import AuditLog from '../components/admin/AuditLog';
import LegalDocuments from '../components/admin/LegalDocuments';
import { BOAT_TYPE_LABELS } from '../components/BoatCard';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { photos } from '../data/photos';
import * as boats from '../services/boats.service';
import { listAllBookings } from '../services/bookings.service';
import { listOwnersAndHotels, listAllUsers } from '../services/users.service';
import type { OwnerBoat, BoatStatus } from '../services/boats.service';

type View = 'queue' | 'all' | 'live' | 'attention' | 'bookings' | 'users' | 'roles' | 'audit' | 'legal';

const STATUS_CHIP: Record<BoatStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-lake-100 text-lake-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-red-100 text-red-700',
};

function BoatList({ boats: list }: { boats: OwnerBoat[] }) {
  if (list.length === 0) return <EmptyState title="No boats here" hint="Nothing matches this filter yet." />;
  return (
    <div className="space-y-3">
      {list.map((b) => (
        <div key={b.id} className="rounded-2xl border border-lake-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lake-950">{b.name}</h3>
              <p className="text-xs text-lake-500">
                {BOAT_TYPE_LABELS[b.boatType]} · up to {b.capacity} guests · {b.location}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[b.status]}`}>
              {b.status}
            </span>
          </div>
          <div className="mt-2 grid gap-1 text-xs text-lake-600 sm:grid-cols-2">
            <p>Price: {b.pricePerDay != null ? `$${b.pricePerDay}/day` : ''}{b.pricePerHour != null ? ` $${b.pricePerHour}/hour` : ''}</p>
            <p>Maintenance: {b.maintenanceStatus}</p>
            <p>Registration: {b.registrationNumber || 'Not provided'}</p>
            <p>Active: {b.isActive ? 'yes' : 'no'}</p>
            <p className="sm:col-span-2">Safety: {b.safetyEquipment.length ? b.safetyEquipment.join(', ') : 'None listed'}</p>
          </div>
          {b.status === 'approved' && (
            <Link to={`/boats/${b.id}`} className="mt-2 inline-block text-xs font-semibold text-lake-700 hover:text-lake-900">
              View public listing
            </Link>
          )}
        </div>
      ))}
    </div>
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
  const [view, setView] = useState<View>('queue');

  const list = boatData ?? [];
  const activeBookings = (bookingData ?? []).filter(
    (b) => b.status === 'requested' || b.status === 'confirmed' || b.status === 'deposit_paid',
  ).length;
  const unverified = (userData ?? []).filter((u) => u.verificationStatus === 'pending').length;

  const tiles: { key: View; label: string; value: number; icon: typeof Anchor }[] = [
    { key: 'all', label: 'Total boats', value: list.length, icon: Anchor },
    { key: 'queue', label: 'Awaiting review', value: list.filter((b) => b.status === 'pending' || b.pendingChanges).length, icon: Clock },
    { key: 'live', label: 'Live for tourists', value: list.filter((b) => b.status === 'approved' && b.isActive).length, icon: CheckCircle2 },
    { key: 'attention', label: 'Maintenance attention', value: list.filter((b) => b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue').length, icon: Wrench },
    { key: 'bookings', label: 'Active bookings', value: activeBookings, icon: CalendarCheck },
    { key: 'users', label: 'Unverified owners/hotels', value: unverified, icon: UserCheck },
    { key: 'audit', label: 'Activity log', value: 0, icon: ScrollText },
  ];
  if (isSuper) {
    tiles.push({ key: 'roles', label: 'Admins and roles', value: (allUsers ?? []).filter((u) => u.role === 'admin').length, icon: UserCog });
    tiles.push({ key: 'legal', label: 'Legal documents', value: 0, icon: FileText });
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <DashboardBanner image={photos.wildlife1} eyebrow="Admin panel" title="Platform oversight" icon={ShieldCheck} />

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {tiles.map((t, i) => (
            <StatTile key={t.key} index={i} label={t.label} value={t.value} icon={t.icon}
              active={view === t.key} onClick={() => setView(t.key)} />
          ))}
        </div>

        <div className="mt-8">
          {view === 'queue' && <ApprovalQueue />}
          {view === 'bookings' && (<><h2 className="mb-3 font-semibold text-lake-950">All bookings</h2><AdminBookings /></>)}
          {view === 'users' && (<><h2 className="mb-3 font-semibold text-lake-950">Owner and hotel verification</h2><UserVerification /></>)}
          {view === 'roles' && isSuper && (<><h2 className="mb-3 font-semibold text-lake-950">Admins and roles</h2><RoleManagement /></>)}
          {view === 'audit' && (<><h2 className="mb-3 font-semibold text-lake-950">Activity log</h2><AuditLog /></>)}
          {view === 'legal' && isSuper && (<><h2 className="mb-3 font-semibold text-lake-950">Legal documents</h2><LegalDocuments /></>)}
          {(view === 'all' || view === 'live' || view === 'attention') && (
            <>
              <h2 className="mb-3 font-semibold text-lake-950">
                {view === 'all' ? 'All boats' : view === 'live' ? 'Live boats' : 'Boats needing maintenance'}
              </h2>
              {loading && <LoadingState label="Loading boats" />}
              {error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && (
                <BoatList boats={
                  view === 'all' ? list
                    : view === 'live' ? list.filter((b) => b.status === 'approved' && b.isActive)
                    : list.filter((b) => b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue')
                } />
              )}
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
