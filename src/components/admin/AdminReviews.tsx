import { useId, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import BookingRef from '../BookingRef';
import Reveal from '../Reveal';
import ReviewCard from '../reviews/ReviewCard';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard, portalButtonDanger, portalButtonSecondary } from '../portal/styles';
import { adminButtonCommit, adminButtonConfirmReject } from './styles';
import { useAsync } from '../../hooks/useAsync';
import * as reviewsSvc from '../../services/reviews.service';
import type { HiddenReason, Review } from '../../services/reviews.service';

type Filter = 'all' | 'visible' | 'hidden';
const REASONS: HiddenReason[] = ['abuse', 'personal_data', 'spam'];
const REASON_HINTS: Record<HiddenReason, string> = {
  abuse: 'Insults, threats, hate or harassment.',
  personal_data: 'Phone numbers, addresses or other people’s full names.',
  spam: 'Advertising, links, or not about the trip.',
};

/**
 * Hide a review with a required reason, or restore it. Two steps, as the other
 * admin decisions: "Hide review" opens the reasons, and the hide is only sent
 * once one is chosen. A hidden review leaves the public list and averages; its
 * writer and the boat's operator still see it, marked hidden.
 */
function Moderation({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<HiddenReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const groupId = useId();

  const run = async (hidden: boolean) => {
    if (hidden && !reason) { setError('Choose why this review is being hidden.'); return; }
    setBusy(true); setError('');
    try {
      await reviewsSvc.setReviewHidden(review.id, hidden, reason || undefined);
      setOpen(false); setReason('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this review.');
    } finally {
      setBusy(false);
    }
  };

  if (review.hidden) {
    return (
      <div className="mt-3.5 border-t border-lake-100 pt-3.5">
        <button type="button" onClick={() => run(false)} disabled={busy} className={`${adminButtonCommit} min-h-11`}>
          <Eye size={16} aria-hidden /> {busy ? 'Restoring' : 'Restore review'}
        </button>
        {error && <p role="alert" className="mt-2 text-[15px] font-medium text-red-700">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-3.5 border-t border-lake-100 pt-3.5">
        <button type="button" onClick={() => setOpen(true)} className={`${portalButtonDanger} min-h-11`}>
          <EyeOff size={16} aria-hidden /> Hide review
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3.5 rounded-lg border border-red-200 bg-red-50/60 p-4">
      <fieldset>
        <legend id={groupId} className="text-base font-bold text-lake-950">Why hide this review?</legend>
        <p className="mt-0.5 text-sm text-lake-700">Required. The guest and the operator will see that it was hidden, and why.</p>
        <div className="mt-2 space-y-1.5">
          {REASONS.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-white">
              <input type="radio" name={`${groupId}-reason`} value={r} checked={reason === r}
                onChange={() => { setReason(r); setError(''); }}
                className="mt-1 h-4 w-4 shrink-0 accent-lake-700" />
              <span className="text-base text-lake-950">
                <span className="font-semibold">{reviewsSvc.HIDDEN_REASON_LABELS[r]}</span>
                <span className="block text-sm text-lake-700">{REASON_HINTS[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-2 text-[15px] font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => run(true)} disabled={busy || !reason} className={`${adminButtonConfirmReject} min-h-11`}>
          {busy ? 'Hiding' : 'Hide review'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setReason(''); setError(''); }} disabled={busy}
          className={`${portalButtonSecondary} min-h-11`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The admin's Reviews view: every review on the platform, with moderation. */
export default function AdminReviews() {
  const { data, loading, error, reload } = useAsync(reviewsSvc.listAllReviews, []);
  const { data: canModerate } = useAsync(reviewsSvc.hasReviewsUpgrade, []);
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>('all');
  const filterId = useId();

  if (loading && !data) return <LoadingState large label="Loading reviews" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;
  const all = data ?? [];
  const hiddenCount = all.filter((r) => r.hidden).length;
  const rows = all.filter((r) => filter === 'all' || (filter === 'hidden' ? r.hidden : !r.hidden));

  return (
    <div className="space-y-3">
      {canModerate === false && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] leading-normal text-amber-900">
          Hiding reviews switches on once database migration 32 is applied. Until then reviews are listed read-only.
        </p>
      )}
      {all.length > 0 && (
        <div className="sm:max-w-xs">
          <label htmlFor={filterId} className="block text-sm font-semibold text-lake-800">Show</label>
          <select id={filterId} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}
            className="mt-1.5 min-h-11 w-full rounded-lg border border-lake-200 bg-white px-3 py-2 text-base text-lake-950 outline-none focus:border-lake-500">
            <option value="all">All reviews ({all.length})</option>
            <option value="visible">Public ({all.length - hiddenCount})</option>
            <option value="hidden">Hidden ({hiddenCount})</option>
          </select>
        </div>
      )}
      {all.length === 0 && (
        <EmptyState large title="No reviews yet" hint="Reviews from completed trips across the platform appear here." />
      )}
      {all.length > 0 && rows.length === 0 && (
        <EmptyState large title="Nothing to show" hint="No review matches this filter." />
      )}
      <ul className="space-y-3">
        <AnimatePresence>
          {rows.map((r) => (
            <Reveal as="li" key={r.id} layout={!reduce}
              exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              className={`${portalCard} p-4 sm:p-5`}>
              <ReviewCard review={r} showHidden
                heading={
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-lake-100 pb-3">
                    <p className="min-w-0 break-words text-base font-bold text-lake-950">{r.boatName ?? 'Boat'}</p>
                    <BookingRef reference={r.bookingReference ?? ''} />
                  </div>
                }>
                {canModerate && <Moderation review={r} onChanged={reload} />}
              </ReviewCard>
            </Reveal>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
