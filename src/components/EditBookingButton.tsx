import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import BookingModal from './BookingModal';
import * as boats from '../services/boats.service';
import type { PublicBoat } from '../services/boats.service';
import type { BookingRow } from '../services/bookings.service';

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2';

/**
 * "Edit request" on a booking that is still 'requested': opens the booking form in
 * edit mode (BookingModal `editing`), prefilled from the booking. Used on the
 * tourist's trips and on hotel and agency booking cards; the server
 * (update_booking_request) decides who may edit, so this only offers the button.
 *
 * The form needs the boat's current rates, deposit and capacity, so the boat is
 * read from public_boats when the button is pressed. A boat that is no longer
 * listed cannot be booked, and so cannot take a changed request either; the
 * button says so and the booking can still be cancelled.
 */
export default function EditBookingButton({
  booking, onBehalfOfGuest = false, onSaved, disabled = false,
}: {
  booking: BookingRow;
  /** Hotel and agency staff edit a guest's booking: the form says "the guest's". */
  onBehalfOfGuest?: boolean;
  /** Runs when the form closes after a saved change, normally the list's reload. */
  onSaved: () => void;
  disabled?: boolean;
}) {
  const [boat, setBoat] = useState<PublicBoat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  if (booking.status !== 'requested') return null;

  const open = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const b = await boats.getPublicBoat(booking.boatId);
      if (!b) {
        setError('This boat is not taking bookings right now, so this request cannot be changed. You can still cancel it.');
        return;
      }
      setSaved(false);
      setBoat(b);
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setBoat(null);
    if (saved) onSaved();
  };

  return (
    <div>
      <button type="button" onClick={open} disabled={disabled} aria-busy={loading || undefined}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-lake-200 bg-white px-3 py-2 text-sm font-semibold text-lake-700 hover:bg-lake-50 hover:text-lake-950 disabled:opacity-50 ${FOCUS_RING}`}>
        {loading
          ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />
          : <Pencil size={15} aria-hidden />}
        Edit request
      </button>
      {error && <p role="alert" className="mt-2 max-w-sm text-sm font-medium text-red-700">{error}</p>}
      {boat && (
        <BookingModal
          boat={boat}
          touristId={null}
          onBehalfOfGuest={onBehalfOfGuest}
          editing={booking}
          onSaved={() => setSaved(true)}
          onClose={close}
        />
      )}
    </div>
  );
}
