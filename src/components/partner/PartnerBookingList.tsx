import { AnimatePresence, useReducedMotion } from 'framer-motion';
import Reveal from '../Reveal';
import StatusBadge from '../StatusBadge';
import BookingFigures from '../BookingFigures';
import BookingRef from '../BookingRef';
import CancelBookingButton from '../CancelBookingButton';
import EditBookingButton from '../EditBookingButton';
import { portalCard } from '../portal/styles';
import type { BookingRow } from '../../services/bookings.service';

// The statuses cancel_booking will still cancel (the same set the trip list uses).
const CANCELLABLE = new Set(['requested', 'confirmed', 'deposit_paid']);

/**
 * The bookings a hotel or agency has made for its guests, one portal card each:
 * boat as the title with the booking reference chip under it, status badge,
 * then the labelled Guest / When / Group / Total figures. `boatName` resolves
 * the title the way each dashboard always has. With `onCancelled`, an open
 * booking gets the shared Cancel button (cancel_booking lets the hotel or agency
 * that made it cancel it), and a request still awaiting the operator gets Edit
 * request (update_booking_request lets the same hotel or agency change it). The
 * callback reloads the list after either.
 * Each card rises in as it scrolls into view.
 */
export default function PartnerBookingList({
  bookings, boatName, showCaptain = false, emptyText, onCancelled,
}: {
  bookings: BookingRow[];
  boatName: (b: BookingRow) => string;
  /** The agency view names the assigned captain; the hotel view never has. */
  showCaptain?: boolean;
  emptyText: string;
  /** Runs once a booking has been cancelled, normally the list's reload. */
  onCancelled?: () => void;
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
              <div className="min-w-0">
                <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{boatName(b)}</h3>
                <BookingRef reference={b.reference} className="mt-1.5" />
              </div>
              <StatusBadge status={b.status} />
            </div>
            <BookingFigures booking={b} />
            {showCaptain && b.captainName && (
              <p className="mt-3 break-words text-[15px] leading-normal text-lake-700">
                Captain: <span className="font-semibold text-lake-900">{b.captainName}</span>
              </p>
            )}
            {onCancelled && CANCELLABLE.has(b.status) && (
              <div className="mt-3.5 flex flex-wrap items-start gap-2 border-t border-lake-100 pt-3.5">
                {/* A request the operator has not answered yet can be changed by the
                    hotel or agency that made it (update_booking_request). */}
                <EditBookingButton booking={{ ...b, boatName: boatName(b) }} onBehalfOfGuest onSaved={onCancelled} />
                <CancelBookingButton booking={{ ...b, boatName: boatName(b) }} onCancelled={onCancelled} />
              </div>
            )}
          </Reveal>
        ))}
      </AnimatePresence>
    </ul>
  );
}
