import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban } from 'lucide-react';
import StatusBadge from '../StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';
import type { BookingRow } from '../../services/bookings.service';

const OPEN = new Set(['requested', 'confirmed', 'deposit_paid']);

function tripWhen(b: BookingRow): string {
  if (b.startTime && b.durationHours) return `${b.startDate} at ${b.startTime} (${b.durationHours}h)`;
  return `${b.startDate}, ${b.days} day${b.days > 1 ? 's' : ''}`;
}

export default function AdminBookings() {
  const { data, loading, error, reload } = useAsync(bookingsSvc.listAllBookings, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const cancel = async (id: string) => {
    setBusyId(id); setActionError('');
    try { await bookingsSvc.cancelBooking(id); reload(); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Could not cancel.'); }
    finally { setBusyId(null); }
  };

  if (loading) return <LoadingState label="Loading bookings" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const rows = data ?? [];

  return (
    <div className="space-y-3">
      {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      {rows.length === 0 && (
        <EmptyState title="No bookings yet" hint="Bookings across the whole platform appear here." />
      )}
      <AnimatePresence>
        {rows.map((b) => (
          <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lake-100 bg-white p-3">
            <div>
              <p className="font-medium text-lake-950">{b.boatName}</p>
              <p className="text-xs text-lake-500">
                {b.guestName} · {tripWhen(b)} · {b.groupSize} guest{b.groupSize > 1 ? 's' : ''} · ${b.priceTotal}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={b.status} />
              {OPEN.has(b.status) && (
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
  );
}
