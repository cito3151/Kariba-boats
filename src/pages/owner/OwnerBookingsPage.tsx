import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, X, Wallet, CheckCircle2, Ban } from 'lucide-react';
import PageTransition from '../../components/PageTransition';
import StatusBadge from '../../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import { useAuth } from '../../data/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';
import type { BookingRow, BookingStatus } from '../../services/bookings.service';

const ORDER: Record<BookingStatus, number> = {
  requested: 0, confirmed: 1, deposit_paid: 2, completed: 3, declined: 4, cancelled: 5,
};

function tripWhen(b: BookingRow): string {
  if (b.startTime && b.durationHours) return `${b.startDate} at ${b.startTime} (${b.durationHours}h)`;
  return `${b.startDate}, ${b.days} day${b.days > 1 ? 's' : ''}`;
}

export default function OwnerBookingsPage() {
  const { currentUser } = useAuth();
  const ownerId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => bookingsSvc.listBookingsForOwner(ownerId), [ownerId]);
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
        <Link to="/owner" className="inline-flex items-center gap-1.5 text-sm text-lake-600 hover:text-lake-900">
          <ArrowLeft size={15} /> Back to your boats
        </Link>
        <h1 className="mt-3 font-display text-2xl font-medium text-lake-950">Bookings</h1>
        <p className="mt-1 text-sm text-lake-500">
          Confirm or decline requests, then mark deposits and completed trips as they happen.
        </p>

        {actionError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
        )}

        <div className="mt-5 space-y-3">
          {loading && <LoadingState label="Loading bookings" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {!loading && !error && rows.length === 0 && (
            <EmptyState title="No bookings yet" hint="Requests from tourists and hotels will appear here." />
          )}
          <AnimatePresence>
            {rows.map((b) => (
              <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} className="rounded-2xl border border-lake-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-lake-950">{b.boatName}</h3>
                    <p className="text-xs text-lake-500">
                      {b.guestName} · {tripWhen(b)} · {b.groupSize} guest{b.groupSize > 1 ? 's' : ''} · ${b.priceTotal}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {b.status === 'requested' && (
                    <>
                      <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'confirmed'))}
                        disabled={busyId === b.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check size={13} /> Confirm
                      </button>
                      <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'declined'))}
                        disabled={busyId === b.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-lake-200 px-3 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-50 disabled:opacity-50">
                        <X size={13} /> Decline
                      </button>
                    </>
                  )}
                  {b.status === 'confirmed' && (
                    <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'deposit_paid'))}
                      disabled={busyId === b.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-lake-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
                      <Wallet size={13} /> Mark deposit paid
                    </button>
                  )}
                  {(b.status === 'confirmed' || b.status === 'deposit_paid') && (
                    <>
                      <button onClick={() => run(b.id, () => bookingsSvc.setOwnerBookingStatus(b.id, 'completed'))}
                        disabled={busyId === b.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        <CheckCircle2 size={13} /> Complete
                      </button>
                      <button onClick={() => run(b.id, () => bookingsSvc.cancelBooking(b.id))}
                        disabled={busyId === b.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                        <Ban size={13} /> Cancel
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </PageTransition>
  );
}
