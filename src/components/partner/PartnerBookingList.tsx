import { AnimatePresence, useReducedMotion } from 'framer-motion';
import Reveal from '../Reveal';
import StatusBadge from '../StatusBadge';
import BookingFigures from '../BookingFigures';
import { portalCard } from '../portal/styles';
import type { BookingRow } from '../../services/bookings.service';

/**
 * The bookings a hotel or agency has made for its guests, one portal card each:
 * boat as the title, status badge, then the labelled Guest / When / Group / Total
 * figures. `boatName` resolves the title the way each dashboard always has.
 * Each card rises in as it scrolls into view.
 */
export default function PartnerBookingList({
  bookings, boatName, showCaptain = false, emptyText,
}: {
  bookings: BookingRow[];
  boatName: (b: BookingRow) => string;
  /** The agency view names the assigned captain; the hotel view never has. */
  showCaptain?: boolean;
  emptyText: string;
}) {
  const reduce = useReducedMotion();

  if (bookings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-lake-200 bg-white py-10 text-center text-base text-lake-700">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      <AnimatePresence>
        {bookings.map((b) => (
          <Reveal as="li" key={b.id} layout={!reduce} exit={{ opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            className={`${portalCard} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{boatName(b)}</h3>
              <StatusBadge status={b.status} />
            </div>
            <BookingFigures booking={b} />
            {showCaptain && b.captainName && (
              <p className="mt-3 break-words text-[15px] leading-normal text-lake-700">
                Captain: <span className="font-semibold text-lake-900">{b.captainName}</span>
              </p>
            )}
          </Reveal>
        ))}
      </AnimatePresence>
    </ul>
  );
}
