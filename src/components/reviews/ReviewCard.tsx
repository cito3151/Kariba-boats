import type { ReactNode } from 'react';
import { BadgeCheck, EyeOff, MessageSquareReply } from 'lucide-react';
import StarRating from '../StarRating';
import {
  CATEGORY_LABELS, HIDDEN_REASON_LABELS, RATING_CATEGORIES, formatMonth, type Review,
} from '../../services/reviews.service';

/**
 * One review, the same everywhere it appears (the boat page, My trips, the
 * owner's Reviews tab and the admin's moderation view): the reviewer's first
 * name only, a "Verified trip" badge (a review can only be written for a
 * completed booking), the trip month, the stars, the text, any category scores,
 * and the operator's reply.
 *
 * `showHidden` adds the moderation notice for the people who can still see a
 * hidden review: its writer, the boat's operator and admins. `children` is an
 * actions slot under the review (reply editor, moderation controls).
 */
export default function ReviewCard({
  review, showHidden = false, heading, children,
}: {
  review: Review;
  showHidden?: boolean;
  /** Optional line above the review, such as the boat's name in the owner's list. */
  heading?: ReactNode;
  children?: ReactNode;
}) {
  const when = review.tripMonth
    ? `Trip in ${formatMonth(review.tripMonth)}`
    : `Reviewed ${formatMonth(review.createdAt)}`;
  const scores = RATING_CATEGORIES.filter((k) => review.categories[k] != null);

  return (
    <div className="min-w-0">
      {heading}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lake-950 text-base font-bold uppercase text-white">
            {review.reviewerName.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="break-words text-base font-bold leading-snug text-lake-950">{review.reviewerName}</p>
            <p className="text-sm leading-snug text-lake-700">{when}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-1 text-[13px] font-semibold leading-none text-emerald-800 ring-1 ring-emerald-200">
          <BadgeCheck size={14} aria-hidden /> Verified trip
        </span>
      </div>

      <div className="mt-3">
        <StarRating rating={review.rating} size={18} showNumber={false} />
      </div>
      {review.comment && (
        <p className="mt-2 whitespace-pre-line break-words text-base leading-relaxed text-lake-800">{review.comment}</p>
      )}

      {scores.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-lake-700">
          {scores.map((k) => (
            <div key={k} className="flex items-baseline gap-1">
              <dt>{CATEGORY_LABELS[k]}</dt>
              <dd className="font-semibold tabular-nums text-lake-950">{review.categories[k]}/5</dd>
            </div>
          ))}
        </dl>
      )}

      {review.operatorResponse && (
        <div className="mt-3 rounded-lg border-l-4 border-lake-700 bg-lake-50 px-3.5 py-2.5">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-bold text-lake-950">
            <MessageSquareReply size={15} aria-hidden /> Reply from the operator
            {review.operatorRespondedAt && (
              <span className="font-normal text-lake-700">· {formatMonth(review.operatorRespondedAt)}</span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-lake-800">{review.operatorResponse}</p>
        </div>
      )}

      {showHidden && review.hidden && (
        <p role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[15px] leading-snug text-amber-900">
          <EyeOff size={17} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <span className="font-bold">Hidden by our moderators</span>
            {review.hiddenReason && <> ({HIDDEN_REASON_LABELS[review.hiddenReason].toLowerCase()})</>}.
            {' '}It no longer shows on the boat&rsquo;s page or counts towards its rating.
          </span>
        </p>
      )}

      {children}
    </div>
  );
}
