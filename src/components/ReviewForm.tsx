import { useState } from 'react';
import { Star, Send } from 'lucide-react';
import { createReview } from '../services/reviews.service';
import { portalButtonPrimary } from './portal/styles';

// Leave a review for a completed trip. The server (guard_review_authenticity)
// verifies the booking is completed and belongs to the caller.
export default function ReviewForm({
  bookingId, touristId, onDone,
}: {
  bookingId: string; touristId: string; onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (rating < 1) { setError('Please choose a star rating.'); return; }
    setBusy(true); setError('');
    try {
      await createReview(bookingId, touristId, rating, comment.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3.5 rounded-lg border border-lake-100 bg-lake-50 p-4">
      <p className="text-base font-bold text-lake-950">How was your trip?</p>
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            className="rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-lake-500">
            {/* lake-500, not lake-400: an empty star is a control's state and needs
                3:1 against the lake-50 panel. */}
            <Star size={26}
              className={(hover || rating) >= n ? 'fill-sunset-400 text-sunset-400' : 'text-lake-500'} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={600}
        placeholder="Share a few words about your experience (optional)"
        aria-label="Your review (optional)"
        className="mt-2 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500" />
      {error && <p className="mt-1.5 text-sm font-medium text-red-700">{error}</p>}
      <button onClick={submit} disabled={busy}
        className={`${portalButtonPrimary} mt-2`}>
        <Send size={15} /> {busy ? 'Submitting' : 'Submit review'}
      </button>
    </div>
  );
}
