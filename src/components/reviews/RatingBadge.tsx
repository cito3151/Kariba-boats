import { Star } from 'lucide-react';
import { formatAverage, type RatingSummary } from '../../services/reviews.service';

/**
 * A boat's rating in one line, "★ 4.8 (12 reviews)", for the boat cards and the
 * boat page header. A boat with no visible review says "New" instead of a made-up
 * 0. `summary` undefined means still loading: the line keeps its height empty so
 * the card does not jump when the figure arrives.
 *
 * `tone="dark"` is for white type on the photo header.
 */
export default function RatingBadge({
  summary, tone = 'light', className = '',
}: {
  summary: RatingSummary | undefined;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  if (summary === undefined) {
    return <p aria-hidden className={`h-6 ${className}`} />;
  }

  if (summary.count === 0 || summary.average == null) {
    return (
      <p className={`flex h-6 items-center ${className}`}>
        <span className={`rounded-sm px-2 py-0.5 text-[13px] font-bold uppercase leading-5 tracking-[0.06em] ${
          tone === 'dark' ? 'bg-white text-lake-950' : 'bg-lake-50 text-lake-800 ring-1 ring-lake-200'
        }`}>
          New
        </span>
        <span className="sr-only">, no reviews yet</span>
      </p>
    );
  }

  const n = summary.count;
  return (
    <p className={`flex h-6 items-center gap-1.5 text-sm ${tone === 'dark' ? 'text-white' : 'text-lake-700'} ${className}`}>
      <Star size={16} aria-hidden className={tone === 'dark' ? 'fill-sunset-400 text-sunset-400' : 'fill-sunset-500 text-sunset-600'} />
      <span className="sr-only">Rated </span>
      <span className={`text-[15px] font-bold tabular-nums ${tone === 'dark' ? 'text-white' : 'text-lake-950'}`}>
        {formatAverage(summary.average)}
      </span>
      <span className="sr-only"> out of 5</span>
      <span className="tabular-nums">({n} review{n === 1 ? '' : 's'})</span>
    </p>
  );
}
