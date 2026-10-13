import { motion, AnimatePresence } from 'framer-motion';
import StatusBadge from '../StatusBadge';
import CancelBookingButton from '../CancelBookingButton';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';

const OPEN = new Set(['requested', 'confirmed', 'deposit_paid']);

export default function AdminBookings() {
  const { data, loading, error, reload } = useAsync(bookingsSvc.listAllBookings, []);

  if (loading) return <LoadingState large label="Loading bookings" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;
  const rows = data ?? [];

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <EmptyState large title="No bookings yet" hint="Bookings across the whole platform appear here." />
      )}
      <AnimatePresence>
        {rows.map((b) => (
          <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lake-100 bg-white px-4 py-3.5">
            <div className="min-w-0">
              <p className="break-words text-base font-semibold text-lake-950">{b.boatName}</p>
              <p className="mt-0.5 break-words text-[15px] leading-normal tabular-nums text-lake-700">
                {b.guestName} · {bookingsSvc.tripWhen(b)} · {b.groupSize} guest{b.groupSize > 1 ? 's' : ''} · {bookingsSvc.tripPrice(b)}
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
