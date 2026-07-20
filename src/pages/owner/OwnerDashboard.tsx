import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Plus, Pencil, Gauge, Trash2, EyeOff, Eye, X, Bell, CalendarDays } from 'lucide-react';
import PageTransition from '../../components/PageTransition';
import DashboardBanner from '../../components/DashboardBanner';
import BoatImage from '../../components/BoatImage';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import { useAuth } from '../../data/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { photos } from '../../data/photos';
import * as boats from '../../services/boats.service';
import * as imagesSvc from '../../services/images.service';
import * as maint from '../../services/maintenance.service';
import type { OwnerBoat, BoatStatus, MaintenanceStatus } from '../../services/boats.service';

const STATUS_CHIP: Record<BoatStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Awaiting review', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Live', className: 'bg-lake-100 text-lake-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700' },
};

const MAINT_CHIP: Record<MaintenanceStatus, { label: string; className: string } | null> = {
  ok: null,
  approaching: { label: 'Service approaching', className: 'bg-sunset-100 text-sunset-700' },
  due: { label: 'Service due', className: 'bg-sunset-200 text-sunset-800' },
  overdue: { label: 'Service overdue', className: 'bg-red-100 text-red-700' },
};

function CoverImage({ boat }: { boat: OwnerBoat }) {
  const { data } = useAsync(() => imagesSvc.listBoatImages(boat.id), [boat.id]);
  const primary = data?.find((i) => i.isPrimary) ?? data?.[0];
  const src = primary
    ? imagesSvc.publicImageUrl(primary.storagePath)
    : `illustration:${boat.boatType}`;
  return <BoatImage src={src} alt={boat.name} className="h-full w-full" showBadge={false} />;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-lake-100 bg-white p-4">
      <p className="text-2xl font-bold tabular-nums text-lake-950">{value}</p>
      <p className="truncate text-xs text-lake-500">{label}</p>
    </div>
  );
}

export default function OwnerDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const ownerId = currentUser?.id ?? '';

  const { data: boatList, loading, error, reload } = useAsync(
    () => boats.listOwnerBoats(ownerId), [ownerId],
  );
  const { data: notifications, reload: reloadNotifs } = useAsync(
    () => maint.listNotifications(), [],
  );

  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const dismissNotif = async (notifId: string) => {
    await maint.markNotificationRead(notifId);
    reloadNotifs();
  };

  const toggleActive = async (boat: OwnerBoat) => {
    setBusyId(boat.id); setActionError('');
    try {
      await boats.setActive(boat.id, !boat.isActive);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the boat.');
    } finally { setBusyId(null); }
  };

  const remove = async (boat: OwnerBoat) => {
    if (!window.confirm(`Delete ${boat.name}? This cannot be undone.`)) return;
    setBusyId(boat.id); setActionError('');
    try {
      await boats.softDeleteBoat(boat.id);
      reload();
    } catch (e) {
      // The database error names the upcoming booking count, so surface it verbatim.
      setActionError(e instanceof Error ? e.message : 'Could not delete the boat.');
    } finally { setBusyId(null); }
  };

  const unread = (notifications ?? []).filter((n) => !n.isRead);
  const list = boatList ?? [];
  const stats = {
    total: list.length,
    live: list.filter((b) => b.status === 'approved' && b.isActive).length,
    pending: list.filter((b) => b.status === 'pending').length,
    attention: list.filter((b) => b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue').length,
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <DashboardBanner
          image={photos.kapentaRig}
          eyebrow="Owner portal"
          title={currentUser?.businessName || currentUser?.name || 'Your boats'}
          icon={Anchor}
        />

        <AnimatePresence>
          {unread.map((n) => (
            <motion.div key={n.id} layout
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-sunset-50 px-4 py-3">
              <p className="flex items-start gap-2 text-sm text-sunset-800">
                <Bell size={15} className="mt-0.5 shrink-0" /> {n.message}
              </p>
              <button onClick={() => dismissNotif(n.id)} className="shrink-0 text-sunset-500 hover:text-sunset-700">
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total boats" value={stats.total} />
            <StatCard label="Live for tourists" value={stats.live} />
            <StatCard label="Awaiting review" value={stats.pending} />
            <StatCard label="Need maintenance" value={stats.attention} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-lake-950">Your boats</h2>
          <div className="flex items-center gap-2">
            <Link to="/owner/bookings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-lake-200 px-3 py-2 text-sm font-medium text-lake-700 hover:bg-lake-50">
              <CalendarDays size={15} /> Bookings
            </Link>
            <Link to="/owner/maintenance"
              className="inline-flex items-center gap-1.5 rounded-lg border border-lake-200 px-3 py-2 text-sm font-medium text-lake-700 hover:bg-lake-50">
              <Gauge size={15} /> Maintenance
            </Link>
            <Link to="/owner/boats/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sunset-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sunset-600">
              <Plus size={15} /> Register a boat
            </Link>
          </div>
        </div>

        {actionError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
        )}

        <div className="mt-4">
          {loading && <LoadingState label="Loading your boats" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {!loading && !error && list.length === 0 && (
            <EmptyState
              title="No boats yet"
              hint="Register your first boat to start taking bookings on Kariba Lake Access."
              action={
                <Link to="/owner/boats/new"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sunset-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sunset-600">
                  <Plus size={15} /> Register your first boat
                </Link>
              }
            />
          )}

          {!loading && !error && list.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((boat) => {
                const maintChip = MAINT_CHIP[boat.maintenanceStatus];
                return (
                  <div key={boat.id} className="overflow-hidden rounded-2xl border border-lake-100 bg-white">
                    <div className="aspect-[4/3] w-full overflow-hidden bg-lake-100">
                      <CoverImage boat={boat} />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-lake-950">{boat.name}</h3>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[boat.status].className}`}>
                          {STATUS_CHIP[boat.status].label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-lake-500">{boat.location}</p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {maintChip && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${maintChip.className}`}>
                            {maintChip.label}
                          </span>
                        )}
                        {boat.pendingChanges && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            Changes awaiting review
                          </span>
                        )}
                      </div>

                      {boat.status === 'rejected' && boat.rejectionReason && (
                        <p className="mt-2 text-xs text-red-600">{boat.rejectionReason}</p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button onClick={() => navigate(`/owner/boats/${boat.id}/edit`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-lake-200 px-2.5 py-1.5 text-xs font-medium text-lake-700 hover:bg-lake-50">
                          <Pencil size={13} /> Edit
                        </button>
                        <Link to="/owner/maintenance"
                          className="inline-flex items-center gap-1 rounded-lg border border-lake-200 px-2.5 py-1.5 text-xs font-medium text-lake-700 hover:bg-lake-50">
                          <Gauge size={13} /> Hours
                        </Link>
                        <button onClick={() => toggleActive(boat)} disabled={busyId === boat.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-lake-200 px-2.5 py-1.5 text-xs font-medium text-lake-700 hover:bg-lake-50 disabled:opacity-50">
                          {boat.isActive ? <><EyeOff size={13} /> Unavailable</> : <><Eye size={13} /> Available</>}
                        </button>
                        <button onClick={() => remove(boat)} disabled={busyId === boat.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
