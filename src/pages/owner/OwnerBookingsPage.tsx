import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, X, Wallet, CheckCircle2, UserCheck } from 'lucide-react';
import PageTransition from '../../components/PageTransition';
import StatusBadge from '../../components/StatusBadge';
import CancelBookingButton from '../../components/CancelBookingButton';
import CaptainManager from '../../components/owner/CaptainManager';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import { useAuth } from '../../data/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';
import * as captainsSvc from '../../services/captains.service';
import type { Captain } from '../../services/captains.service';
import type { BookingRow, BookingStatus } from '../../services/bookings.service';

const ASSIGNABLE = new Set<BookingStatus>(['confirmed', 'deposit_paid', 'completed']);

function AssignCaptain({ booking, captains, onAssigned }: {
  booking: BookingRow; captains: Captain[]; onAssigned: (id: string, fn: () => Promise<void>) => void;
}) {
  const [captainId, setCaptainId] = useState('');
  if (!ASSIGNABLE.has(booking.status)) return null;
  return (
    <div className="mt-3 border-t border-lake-100 pt-3">
      {booking.captainName ? (
        <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] leading-normal text-lake-700">
          <UserCheck size={16} className="text-emerald-700" /> Captain: <span className="font-semibold text-lake-900">{booking.captainName}</span> · <span className="tabular-nums">{booking.captainPhone}</span>
        </p>
      ) : (
        <p className="text-[15px] text-lake-700">No captain assigned yet.</p>
      )}
      {captains.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={captainId} onChange={(e) => setCaptainId(e.target.value)}
            className="min-w-0 max-w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500">
            <option value="">Choose a captain</option>
            {captains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={!captainId}
            onClick={() => onAssigned(booking.id, () => captainsSvc.assignCaptain(booking.id, captainId))}
            className="rounded-lg bg-lake-700 px-3 py-2 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
            {booking.captainName ? 'Reassign' : 'Assign captain'}
          </button>
        </div>
      )}
    </div>
  );
}

const ORDER: Record<BookingStatus, number> = {
  requested: 0, confirmed: 1, deposit_paid: 2, completed: 3, declined: 4, cancelled: 5,
};

export default function OwnerBookingsPage() {
  const { currentUser } = useAuth();
  const ownerId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => bookingsSvc.listBookingsForOwner(ownerId), [ownerId]);
  const { data: captainsData, reload: reloadCaptains } = useAsync(() => captainsSvc.listMyCaptains(ownerId), [ownerId]);
  const captains = captainsData ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id); setActionError('');
    try { await fn(); reload(); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusyId(null); }
  };

  const rows = [...(data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <Link to="/owner" className="inline-flex items-center gap-1.5 py-1 text-[15px] font-medium text-lake-700 hover:text-lake-900">
          <ArrowLeft size={16} /> Back to your boats
        </Link>
        <h1 className="mt-3 font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-lake-950 sm:text-[2rem]">Bookings</h1>
        <p className="mt-2 text-base leading-normal text-lake-700">
          Confirm or decline requests, then mark deposits and completed trips as they happen.
        </p>

        {actionError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{actionError}</p>
        )}

        <div className="mt-5">
          <CaptainManager ownerId={ownerId} captains={captains} onChanged={reloadCaptains} />
        </div>

        <div className="mt-5 space-y-3">
          {loading && <LoadingState large label="Loading bookings" />}
          {error && <ErrorState large message={error} onRetry={reload} />}
          {!loading && !error && rows.length === 0 && (
            <EmptyState large title="No bookings yet" hint="Requests from tourists and hotels will appear here." />
          )}
          <AnimatePresence>
            {rows.map((b) => (
              <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} className="rounded-2xl border border-lake-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-[1.0625rem] font-semibold leading-snug text-lake-950">{b.boatName}</h3>
                    <p className="mt-1 break-words text-[15px] leading-normal tabular-nums text-lake-700">
                      <span className="font-semibold text-lake-900">{b.guestName}</span> · {bookingsSvc.tripWhen(b)} · {b.groupSize} guest{b.groupSize > 1 ? 's' : ''} · <span className="font-semibold text-lake-900">${b.priceTotal}</span>
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>

                <div className="mt-3.5 flex flex-wrap items-start gap-2">
                  {b.status === 'requested' && (
                    <>
                      <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'confirmed'))}
                        disabled={busyId === b.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                        <Check size={15} /> Confirm
                      </button>
                      <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'declined'))}
                        disabled={busyId === b.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-lake-200 px-3 py-2 text-sm font-semibold text-lake-700 hover:bg-lake-50 disabled:opacity-50">
                        <X size={15} /> Decline
                      </button>
                    </>
                  )}
                  {b.status === 'confirmed' && (
                    <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'deposit_paid'))}
                      disabled={busyId === b.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-lake-700 px-3 py-2 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
                      <Wallet size={15} /> Mark deposit paid
                    </button>
                  )}
                  {(b.status === 'confirmed' || b.status === 'deposit_paid') && (
                    <>
                      <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'completed'))}
                        disabled={busyId === b.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                        <CheckCircle2 size={15} /> Complete
                      </button>
                      <CancelBookingButton booking={b} onCancelled={reload} disabled={busyId === b.id} />
                    </>
                  )}
                </div>

                <AssignCaptain booking={b} captains={captains} onAssigned={run} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </PageTransition>
  );
}
