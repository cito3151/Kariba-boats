import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Ban } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import EmergencyContacts from '../components/EmergencyContacts';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import * as bookingsSvc from '../services/bookings.service';
import type { BookingRow } from '../services/bookings.service';

function tripWhen(b: BookingRow): string {
  if (b.startTime && b.durationHours) return `${b.startDate} at ${b.startTime} (${b.durationHours}h)`;
  return `${b.startDate}, ${b.days} day${b.days > 1 ? 's' : ''}`;
}

const CANCELLABLE = new Set(['requested', 'confirmed', 'deposit_paid']);

export default function TouristTripsPage() {
  const { currentUser } = useAuth();
  const touristId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => bookingsSvc.listMyBookings(touristId), [touristId]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const cancel = async (id: string) => {
    setBusyId(id); setActionError('');
    try { await bookingsSvc.cancelBooking(id); reload(); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Could not cancel.'); }
    finally { setBusyId(null); }
  };

  const rows = data ?? [];

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <h1 className="font-display text-2xl font-medium text-lake-950">My trips</h1>
        <p className="mt-1 text-sm text-lake-500">Your booking requests and their status.</p>

        {actionError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
        )}

        <div className="mt-5 space-y-3">
          {loading && <LoadingState label="Loading your trips" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {!loading && !error && rows.length === 0 && (
            <EmptyState
              title="You have not booked any trips yet"
              hint="Browse boats and send a booking request to get started."
              action={
                <Link to="/" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sunset-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sunset-600">
                  <Anchor size={15} /> Browse boats
                </Link>
              }
            />
          )}
          <AnimatePresence>
            {rows.map((b) => (
              <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lake-100 bg-white p-4">
                <div>
                  <h3 className="font-semibold text-lake-950">{b.boatName}</h3>
                  <p className="text-xs text-lake-500">
                    {b.boatLocation} · {tripWhen(b)} · {b.groupSize} guest{b.groupSize > 1 ? 's' : ''} · ${b.priceTotal}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={b.status} />
                  {CANCELLABLE.has(b.status) && (
                    <button onClick={() => cancel(b.id)} disabled={busyId === b.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                      <Ban size={13} /> Cancel
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {rows.length > 0 && <div className="mt-8"><EmergencyContacts /></div>}
      </div>
    </PageTransition>
  );
}
