import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Ban } from 'lucide-react';
import { cancelBooking, tripWhen } from '../services/bookings.service';
import type { BookingRow } from '../services/bookings.service';

// The server's cancel_booking has no undo, so a stray tap must never be enough.
// The first press swaps the button for an inline "Are you sure" panel in the same
// spot (no modal, no window.confirm), so it stays next to the booking it names.
// Used wherever a booking can be cancelled: the trip list, the owner's bookings
// and the admin bookings table.

interface Props {
  booking: Pick<BookingRow, 'id' | 'boatName' | 'startDate' | 'days' | 'startTime' | 'durationHours'>;
  /** Runs once the server has cancelled the booking. Normally the list's reload. */
  onCancelled: () => void;
  /** Disables the first button, e.g. while another action on the same booking runs. */
  disabled?: boolean;
}

const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

export default function CancelBookingButton({ booking, onCancelled, disabled = false }: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Set when the panel closes by the user's choice, so focus goes back to the trigger
  // once it is on screen again. Not set on success, where the booking moves on.
  const restoreFocus = useRef(false);

  const what = `${booking.boatName}, ${tripWhen(booking)}`;

  useEffect(() => {
    if (open) confirmRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const close = () => {
    if (busy) return;
    restoreFocus.current = true;
    setOpen(false);
    setError('');
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await cancelBooking(booking.id);
      setDone(true);
      setOpen(false);
      onCancelled();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel this booking.');
    } finally {
      setBusy(false);
    }
  };

  // One persistent live region carries the spoken state. It has to exist before its
  // text changes, which is why it is rendered in every state.
  const announcement = done
    ? 'Booking cancelled.'
    : busy
      ? 'Cancelling booking.'
      : open
        ? `Cancel this booking? ${what}. This cannot be undone.`
        : '';

  return (
    <div>
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>

      {done && <p className="text-sm font-medium text-lake-700" aria-hidden>Booking cancelled</p>}

      {!done && !open && (
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)} disabled={disabled}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 focus-visible:ring-red-500 ${FOCUS_RING}`}>
          <Ban size={15} /> Cancel
        </button>
      )}

      {!done && open && (
        <motion.div
          role="group" aria-label="Confirm cancellation"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
          // A short fade with a few pixels of travel, critically damped so it never
          // overshoots. Reduced motion keeps the fade and drops the travel.
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, duration: 0.25 }}
          className="max-w-sm rounded-lg border border-red-200 bg-red-50 p-3.5"
        >
          <p className="text-base font-semibold text-red-900">Cancel this booking?</p>
          <p className="mt-1 break-words text-[15px] leading-snug text-lake-800">{booking.boatName} · {tripWhen(booking)}</p>
          <p className="mt-0.5 text-[15px] leading-snug text-lake-700">This cannot be undone.</p>

          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {/* aria-disabled, not disabled: a focused button that becomes disabled drops
                keyboard focus to the page, and the user loses their place mid-request. */}
            <button ref={confirmRef} type="button" onClick={confirm} aria-disabled={busy}
              className={`rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:ring-red-600 ${FOCUS_RING} ${busy ? 'cursor-not-allowed opacity-60' : ''}`}>
              {busy ? 'Cancelling' : 'Yes, cancel booking'}
            </button>
            <button type="button" onClick={close} aria-disabled={busy}
              className={`rounded-lg border border-lake-200 bg-white px-3.5 py-2 text-sm font-semibold text-lake-700 hover:bg-lake-50 focus-visible:ring-lake-500 ${FOCUS_RING} ${busy ? 'cursor-not-allowed opacity-60' : ''}`}>
              Keep booking
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
