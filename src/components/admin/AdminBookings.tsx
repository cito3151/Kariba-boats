import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import StatusBadge from '../StatusBadge';
import BookingFigures from '../BookingFigures';
import CancelBookingButton from '../CancelBookingButton';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard } from '../portal/styles';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';

const OPEN = new Set(['requested', 'confirmed', 'deposit_paid']);

export default function AdminBookings() {
  const { data, loading, error, reload } = useAsync(bookingsSvc.listAllBookings, []);
  const reduce = useReducedMotion();

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
          <motion.div key={b.id} layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            className={`${portalCard} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{b.boatName}</h3>
              <StatusBadge status={b.status} />
            </div>
            <BookingFigures booking={b} />
            {OPEN.has(b.status) && (
              <div className="mt-3.5 border-t border-lake-100 pt-3.5">
                <CancelBookingButton booking={b} onCancelled={reload} />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
