import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, X, Ban } from 'lucide-react';
import PendingChangesDiff from './PendingChangesDiff';
import { adminButtonApprove, adminButtonConfirmReject } from './styles';
import PortalSection from '../portal/PortalSection';
import { portalCard, portalButtonSecondary, portalButtonDanger } from '../portal/styles';
import { Figure } from '../BookingFigures';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { staggerContainer, staggerItem } from '../motion';
import { useAsync } from '../../hooks/useAsync';
import { supabase } from '../../lib/supabase';
import * as boats from '../../services/boats.service';
import * as imagesSvc from '../../services/images.service';
import type { OwnerBoat } from '../../services/boats.service';

async function loadQueue() {
  const [pending, all] = await Promise.all([
    boats.listBoatsForAdmin('pending'),
    boats.listBoatsForAdmin(),
  ]);
  const changed = all.filter((b) => b.pendingChanges);
  // Merge pending + boats with pending changes, dedup by id.
  const byId = new Map<string, OwnerBoat>();
  [...pending, ...changed].forEach((b) => byId.set(b.id, b));
  const queue = [...byId.values()];

  const attention = all.filter(
    (b) => b.maintenanceStatus === 'due' || b.maintenanceStatus === 'overdue',
  );

  const ownerIds = [...new Set(all.map((b) => b.ownerId))];
  const names: Record<string, string> = {};
  if (ownerIds.length) {
    const { data } = await supabase.from('profiles')
      .select('id, business_name, full_name').in('id', ownerIds);
    (data ?? []).forEach((p) => { names[p.id] = p.business_name || p.full_name || 'Unknown owner'; });
  }
  return { queue, attention, names };
}

function PhotoStrip({ boatId }: { boatId: string }) {
  const { data } = useAsync(() => imagesSvc.listBoatImages(boatId), [boatId]);
  const imgs = data ?? [];
  if (imgs.length === 0) {
    return <p className="text-[15px] font-medium text-red-700">No photos uploaded.</p>;
  }
  return (
    <div className="flex gap-2 overflow-x-auto">
      {imgs.map((img) => (
        <img key={img.id} src={imagesSvc.publicImageUrl(img.storagePath)} alt=""
          className="h-24 w-32 shrink-0 rounded-md object-cover" />
      ))}
    </div>
  );
}

export default function ApprovalQueue() {
  const { data, loading, error, reload } = useAsync(loadQueue, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const reduce = useReducedMotion();

  const act = async (fn: () => Promise<void>, id: string) => {
    setBusyId(id); setActionError('');
    try { await fn(); reload(); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusyId(null); }
  };

  const approve = (b: OwnerBoat) =>
    b.pendingChanges && b.status === 'approved'
      ? act(() => boats.reviewChanges(b.id, true), b.id)
      : act(() => boats.reviewBoat(b.id, 'approve'), b.id);

  const suspend = (b: OwnerBoat) => act(() => boats.reviewBoat(b.id, 'suspend'), b.id);

  const submitReject = (b: OwnerBoat) => {
    if (reason.trim().length < 5) { setActionError('A rejection reason needs at least 5 characters.'); return; }
    const isChanges = b.pendingChanges && b.status === 'approved';
    act(() => (isChanges ? boats.reviewChanges(b.id, false, reason.trim()) : boats.reviewBoat(b.id, 'reject', reason.trim())), b.id)
      .then(() => { setRejectId(null); setReason(''); });
  };

  // This view titles its own two sections, so its loading and error states sit
  // under the first title rather than under none.
  if (loading) return <PortalSection title="Approval queue"><LoadingState large label="Loading the approval queue" /></PortalSection>;
  if (error) return <PortalSection title="Approval queue"><ErrorState large message={error} onRetry={reload} /></PortalSection>;

  const queue = data?.queue ?? [];
  const attention = data?.attention ?? [];
  const names = data?.names ?? {};

  return (
    <div className="space-y-10">
      <PortalSection title="Approval queue">
        {actionError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{actionError}</p>
        )}
        <div className="space-y-4">
          {queue.length === 0 && (
            <EmptyState large title="Nothing to review" hint="New submissions and proposed changes appear here." />
          )}
          <AnimatePresence>
            {queue.map((b) => (
              <motion.div key={b.id} layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                className={`${portalCard} p-4 sm:p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{b.name}</h3>
                    <p className="mt-1 break-words text-[15px] leading-normal text-lake-700">
                      {names[b.ownerId] ?? 'Owner'} · {b.boatType} · up to {b.capacity} guests · {b.location}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                    b.pendingChanges && b.status === 'approved'
                      ? 'bg-amber-100 text-amber-800' : 'bg-lake-100 text-lake-700'
                  }`}>
                    {b.pendingChanges && b.status === 'approved' ? 'Proposed changes' : 'New submission'}
                  </span>
                </div>

                <div className="mt-3"><PhotoStrip boatId={b.id} /></div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-lake-100 pt-3">
                  <Figure label="Price" valueClassName="text-base tabular-nums text-lake-950">
                    {b.pricePerDay != null ? `$${b.pricePerDay}/day` : ''}{b.pricePerHour != null ? ` $${b.pricePerHour}/hour` : ''}
                  </Figure>
                  <Figure label="Registration">{b.registrationNumber || 'Not provided'}</Figure>
                  <Figure label="Safety equipment" className="col-span-2">
                    {b.safetyEquipment.length ? b.safetyEquipment.join(', ') : 'None listed'}
                  </Figure>
                </dl>

                <PendingChangesDiff boat={b} />

                {rejectId === b.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                      placeholder="Reason for rejection (at least 5 characters)"
                      aria-label="Reason for rejection"
                      className="w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500" />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => submitReject(b)} disabled={busyId === b.id} className={adminButtonConfirmReject}>
                        Confirm rejection
                      </button>
                      <button onClick={() => { setRejectId(null); setReason(''); setActionError(''); }} className={portalButtonSecondary}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-lake-100 pt-3.5">
                    <button onClick={() => approve(b)} disabled={busyId === b.id} className={adminButtonApprove}>
                      <Check size={15} /> Approve
                    </button>
                    <button onClick={() => { setRejectId(b.id); setReason(''); setActionError(''); }} className={portalButtonSecondary}>
                      <X size={15} /> Reject
                    </button>
                    {b.status === 'approved' && (
                      <button onClick={() => suspend(b)} disabled={busyId === b.id} className={portalButtonDanger}>
                        <Ban size={15} /> Suspend
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </PortalSection>

      <PortalSection title="Maintenance attention">
        {attention.length === 0 ? (
          <p className="rounded-lg border border-dashed border-lake-200 bg-white py-10 text-center text-base text-lake-700">
            No boats are due or overdue for maintenance.
          </p>
        ) : (
          <motion.ul variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show"
            className={`${portalCard} divide-y divide-lake-100`}>
            {attention.map((b) => (
              <motion.li variants={staggerItem} key={b.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold text-lake-950">{b.name}</p>
                  <p className="break-words text-[15px] text-lake-700">{names[b.ownerId] ?? 'Owner'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${
                  b.maintenanceStatus === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-sunset-100 text-sunset-700'
                }`}>
                  {b.maintenanceStatus === 'overdue' ? 'Overdue' : 'Due'}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </PortalSection>
    </div>
  );
}
