import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Anchor, Plus, Pencil, Gauge, Trash2, EyeOff, Eye, X, Bell, Clock, MapPin } from 'lucide-react';
import OwnerPortalPage from '../../components/owner/OwnerPortalPage';
import { BOAT_STATUS_CHIP } from '../../components/owner/boatStatus';
import PortalSection from '../../components/portal/PortalSection';
import { portalCard, portalButtonPrimary, portalButtonSecondary, portalButtonDanger } from '../../components/portal/styles';
import BoatImage from '../../components/BoatImage';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import StatTile from '../../components/StatTile';
import Reveal from '../../components/Reveal';
import VerificationBanner from '../../components/VerificationBanner';
import DocumentUploader from '../../components/verification/DocumentUploader';
import { useAuth } from '../../data/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import * as boats from '../../services/boats.service';
import * as imagesSvc from '../../services/images.service';
import * as maint from '../../services/maintenance.service';
import type { OwnerBoat, MaintenanceStatus } from '../../services/boats.service';

const MAINT_CHIP: Record<MaintenanceStatus, { label: string; className: string } | null> = {
  ok: null,
  approaching: { label: 'Service approaching', className: 'bg-sunset-100 text-sunset-700' },
  due: { label: 'Service due', className: 'bg-sunset-200 text-sunset-800' },
  overdue: { label: 'Service overdue', className: 'bg-red-100 text-red-700' },
};

// Card actions sit two to a row and share the width, so all four fit a phone
// card without wrapping into a ragged third line.
const cardAction = `${portalButtonSecondary} w-full`;

function CoverImage({ boat }: { boat: OwnerBoat }) {
  const { data } = useAsync(() => imagesSvc.listBoatImages(boat.id), [boat.id]);
  const primary = data?.find((i) => i.isPrimary) ?? data?.[0];
  const src = primary
    ? imagesSvc.publicImageUrl(primary.storagePath)
    : `illustration:${boat.boatType}`;
  return <BoatImage src={src} alt={boat.name} className="h-full w-full" showBadge={false} />;
}

type BoatFilter = 'all' | 'live' | 'pending' | 'attention';

export default function OwnerDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const ownerId = currentUser?.id ?? '';
  const [filter, setFilter] = useState<BoatFilter>('all');

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
  const visible = list.filter((b) => {
    if (filter === 'live') return b.status === 'approved' && b.isActive;
    if (filter === 'pending') return b.status === 'pending';
    if (filter === 'attention') return b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue';
    return true;
  });

  return (
    <OwnerPortalPage
      title={currentUser?.businessName || currentUser?.name || 'Your boats'}
      actions={
        <Link to="/owner/boats/new" className={portalButtonPrimary}>
          <Plus size={16} /> Register a boat
        </Link>
      }
    >
      <VerificationBanner />

      {currentUser?.verificationStatus !== 'verified' && (
        <div className="mb-4"><DocumentUploader /></div>
      )}

      <AnimatePresence initial={false}>
        {unread.map((n) => (
          <motion.div key={n.id} layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className={`${portalCard} mb-4 flex items-start justify-between gap-3 border-l-4 border-l-sunset-500 px-4 py-3`}>
            <p className="flex min-w-0 items-start gap-2 break-words text-base leading-normal text-lake-900">
              <Bell size={18} className="mt-1 shrink-0 text-sunset-700" /> {n.message}
            </p>
            <button onClick={() => dismissNotif(n.id)} aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-1 text-lake-700 outline-none hover:bg-lake-50 hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
              <X size={18} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatTile index={0} icon={Anchor} label="Total boats" value={stats.total}
          active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatTile index={1} icon={Eye} label="Live for tourists" value={stats.live}
          active={filter === 'live'} onClick={() => setFilter(filter === 'live' ? 'all' : 'live')} />
        <StatTile index={2} icon={Clock} label="Awaiting review" value={stats.pending}
          active={filter === 'pending'} onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')} />
        <StatTile index={3} icon={Gauge} label="Need maintenance" value={stats.attention}
          active={filter === 'attention'} onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')} />
      </div>

      <PortalSection title="Your boats" className="mt-10">
        {actionError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{actionError}</p>
        )}

        {loading && <LoadingState large label="Loading your boats" />}
        {error && <ErrorState large message={error} onRetry={reload} />}
        {!loading && !error && list.length === 0 && (
          <EmptyState large
            title="No boats yet"
            hint="Register your first boat to start taking bookings on Kariba Lake Connect."
            action={
              <Link to="/owner/boats/new" className={`${portalButtonPrimary} mt-2`}>
                <Plus size={16} /> Register your first boat
              </Link>
            }
          />
        )}

        {!loading && !error && list.length > 0 && filter !== 'all' && (
          <p className="mb-4 text-base text-lake-700">
            Showing <span className="tabular-nums">{visible.length}</span> {filter === 'live' ? 'live' : filter === 'pending' ? 'awaiting review' : 'needing maintenance'} boat{visible.length !== 1 ? 's' : ''}.
            <button onClick={() => setFilter('all')} className="ml-2 rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">Show all</button>
          </p>
        )}
        {!loading && !error && list.length > 0 && visible.length === 0 && (
          <p className="rounded-lg border border-dashed border-lake-200 bg-white py-10 text-center text-base text-lake-700">
            No boats match this filter.
          </p>
        )}

        {!loading && !error && visible.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((boat) => {
              const maintChip = MAINT_CHIP[boat.maintenanceStatus];
              return (
                <Reveal as="li" key={boat.id} className={`${portalCard} flex flex-col overflow-hidden`}>
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-lake-100">
                    <CoverImage boat={boat} />
                    <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none shadow-sm ${BOAT_STATUS_CHIP[boat.status].className}`}>
                      {BOAT_STATUS_CHIP[boat.status].label}
                    </span>
                  </div>

                  <div className="flex-1 p-4">
                    <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{boat.name}</h3>
                    <p className="mt-1 flex items-start gap-1.5 text-[15px] leading-snug text-lake-700">
                      <MapPin size={15} className="mt-0.5 shrink-0 text-lake-600" aria-hidden />
                      <span className="min-w-0 break-words">{boat.location}</span>
                    </p>

                    {(maintChip || boat.pendingChanges) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {maintChip && (
                          <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${maintChip.className}`}>
                            {maintChip.label}
                          </span>
                        )}
                        {boat.pendingChanges && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[13px] font-semibold text-amber-800">
                            Changes awaiting review
                          </span>
                        )}
                      </div>
                    )}

                    {boat.status === 'rejected' && boat.rejectionReason && (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[15px] leading-normal text-red-700">{boat.rejectionReason}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-lake-100 bg-lake-50/60 p-3">
                    <button onClick={() => navigate(`/owner/boats/${boat.id}/edit`)} className={cardAction}>
                      <Pencil size={15} /> Edit
                    </button>
                    <Link to="/owner/maintenance" className={cardAction}>
                      <Gauge size={15} /> Hours
                    </Link>
                    <button onClick={() => toggleActive(boat)} disabled={busyId === boat.id} className={cardAction}>
                      {boat.isActive ? <><EyeOff size={15} /> Unavailable</> : <><Eye size={15} /> Available</>}
                    </button>
                    <button onClick={() => remove(boat)} disabled={busyId === boat.id}
                      className={`${portalButtonDanger} w-full`}>
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        )}
      </PortalSection>
    </OwnerPortalPage>
  );
}
