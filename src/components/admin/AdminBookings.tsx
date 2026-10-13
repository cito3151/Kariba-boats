import { motion, AnimatePresence } from 'framer-motion';
import StatusBadge from '../StatusBadge';
import CancelBookingButton from '../CancelBookingButton';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';

const OPEN = new Set(['requested', 'confirmed', 'deposit_paid']);

export default function AdminBookings() {
  const { data, loading, error, reload } = useAsync(bookingsSvc.listAllBookings, []);

  if (loading) return <LoadingState label="Loading bookings" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const rows = data ?? [];

  return (
    <div className="space-y-3">
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
                {b.guestName} · {bookingsSvc.tripWhen(b)} · {b.groupSize} guest{b.groupSize > 1 ? 's' : ''} · ${b.priceTotal}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <StatusBadge status={b.status} />
              {OPEN.has(b.status) && (
                <CancelBookingButton booking={b} onCancelled={reload} />
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
