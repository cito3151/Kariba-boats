import { useState } from 'react';
import { Star, Send } from 'lucide-react';
import { createReview } from '../services/reviews.service';

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
    <div className="mt-3 rounded-xl border border-lake-100 bg-lake-50/60 p-3">
      <p className="text-xs font-semibold text-lake-800">How was your trip?</p>
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            className="p-0.5">
            <Star size={22}
              className={(hover || rating) >= n ? 'fill-sunset-400 text-sunset-400' : 'text-lake-300'} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={600}
        placeholder="Share a few words about your experience (optional)"
        className="mt-2 w-full rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm outline-none focus:border-lake-400" />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button onClick={submit} disabled={busy}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sunset-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sunset-600 disabled:opacity-60">
        <Send size={13} /> {busy ? 'Submitting' : 'Submit review'}
      </button>
    </div>
  );
}
