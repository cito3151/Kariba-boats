import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Send, CheckCircle2 } from 'lucide-react';
import StarInput from './reviews/StarInput';
import StarRating from './StarRating';
import { riseOnMount } from './motion';
import {
  CATEGORY_LABELS, RATING_CATEGORIES, REVIEW_MAX_LENGTH, createReview, hasReviewsUpgrade,
  type CategoryScores, type RatingCategory,
} from '../services/reviews.service';
import { portalButtonPrimary, portalButtonSecondary } from './portal/styles';

// Leave a review for a completed trip. The server (guard_review_authenticity)
// verifies the booking is completed and belongs to the caller, the unique
// booking_id allows one review per trip, and guard_review_write keeps it
// unchangeable once it is in. After it goes through, the form turns into a
// thank-you with what was posted; `onClose` takes it away.
export default function ReviewForm({
  bookingId, touristId, boatName, onSubmitted, onClose,
}: {
  bookingId: string;
  touristId: string;
  boatName?: string;
  /** Called once the review is saved, so the page can reload its reviews. */
  onSubmitted: () => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [rating, setRating] = useState(0);
  const [categories, setCategories] = useState<CategoryScores>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // Category scores need migration 32's columns; before that they are not offered.
  const [withCategories, setWithCategories] = useState(false);
  const ids = { rating: useId(), text: useId(), help: useId(), count: useId(), cats: useId() };
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    hasReviewsUpgrade().then((ok) => { if (active) setWithCategories(ok); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (done) successRef.current?.focus(); }, [done]);

  const setCategory = (k: RatingCategory, n: number) => setCategories((prev) => ({ ...prev, [k]: n }));

  const submit = async () => {
    if (rating < 1) { setError('Choose a star rating for the trip as a whole.'); return; }
    setBusy(true); setError('');
    try {
      await createReview(bookingId, touristId, rating, comment.trim(), withCategories ? categories : {});
      setDone(true);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your review.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <motion.div {...riseOnMount(reduce, 0, 12)} ref={successRef} tabIndex={-1} role="status"
        className="mt-3.5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 outline-none sm:p-5">
        <p className="flex items-center gap-2 text-lg font-bold text-emerald-900">
          <CheckCircle2 size={22} aria-hidden /> Thank you, your review is posted
        </p>
        <div className="mt-2"><StarRating rating={rating} size={18} showNumber={false} /></div>
        <p className="mt-2 text-base leading-relaxed text-emerald-900">
          It now appears on {boatName ? <span className="font-semibold">{boatName}</span> : 'the boat'}&rsquo;s page
          and counts towards its rating. The operator may reply to it publicly.
        </p>
        <button type="button" onClick={onClose} className={`${portalButtonSecondary} mt-3`}>Done</button>
      </motion.div>
    );
  }

  const left = REVIEW_MAX_LENGTH - comment.length;

  return (
    <motion.div {...riseOnMount(reduce, 0, 12)}
      className="mt-3.5 rounded-lg border border-lake-100 bg-lake-50 p-4 sm:p-5">
      <p id={ids.rating} className="text-lg font-bold text-lake-950">How was your trip?</p>
      <p className="mt-0.5 text-sm text-lake-700">Your overall rating. Required.</p>
      <div className="mt-2">
        <StarInput value={rating} onChange={(n) => { setRating(n); setError(''); }} labelId={ids.rating} />
      </div>

      {withCategories && (
        <fieldset className="mt-4 border-t border-lake-200 pt-4">
          <legend id={ids.cats} className="text-base font-bold text-lake-950">Rate the details <span className="font-normal text-lake-700">(optional)</span></legend>
          <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
            {RATING_CATEGORIES.map((k) => (
              <div key={k}>
                <p id={`${ids.cats}-${k}`} className="text-sm font-semibold text-lake-800">{CATEGORY_LABELS[k]}</p>
                <StarInput size="md" value={categories[k] ?? 0} onChange={(n) => setCategory(k, n)} labelId={`${ids.cats}-${k}`} />
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <label htmlFor={ids.text} className="mt-4 block text-base font-bold text-lake-950">
        Tell other guests about it <span className="font-normal text-lake-700">(optional)</span>
      </label>
      <ul id={ids.help} className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-lake-700">
        <li>What stood out: the boat, the captain and crew, the route, the value.</li>
        <li>Keep to your own experience. Leave out phone numbers and other people&rsquo;s names.</li>
        <li>Reviews cannot be edited once posted, so read it through first.</li>
      </ul>
      <textarea id={ids.text} value={comment} onChange={(e) => setComment(e.target.value)} rows={4}
        maxLength={REVIEW_MAX_LENGTH}
        aria-describedby={`${ids.help} ${ids.count}`}
        placeholder="We spent the afternoon fishing near…"
        className="mt-2 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base leading-relaxed text-lake-950 outline-none placeholder:text-lake-600 focus:border-lake-500 focus-visible:ring-2 focus-visible:ring-lake-500/30" />
      <p id={ids.count} className={`mt-1 text-right text-sm tabular-nums ${left < 50 ? 'font-semibold text-amber-800' : 'text-lake-700'}`}>
        {comment.length} / {REVIEW_MAX_LENGTH}<span className="sr-only"> characters</span>
      </p>

      {error && <p role="alert" className="mt-1.5 text-[15px] font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={submit} disabled={busy} className={`${portalButtonPrimary} min-h-11`}>
          <Send size={16} aria-hidden /> {busy ? 'Posting review' : 'Post review'}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className={`${portalButtonSecondary} min-h-11`}>
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
