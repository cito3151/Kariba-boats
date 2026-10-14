import { motion, useReducedMotion } from 'framer-motion';
import StarRating from '../StarRating';
import { canObserve, revealSpring } from '../motion';
import {
  CATEGORY_LABELS, RATING_CATEGORIES, formatAverage, type RatingSummary,
} from '../../services/reviews.service';

/**
 * The review summary at the head of a boat's reviews: the average set large with
 * its stars and count, then how the reviews spread from 5 stars down to 1, then
 * the category averages when guests gave any. Only called with at least one
 * review; the caller says "No reviews yet" otherwise.
 *
 * Each bar draws across from its left end as it scrolls into view (transform
 * only); under reduced motion the bars are simply there.
 */
export default function RatingSummaryPanel({ summary }: { summary: RatingSummary }) {
  const reduce = useReducedMotion();
  const average = summary.average ?? 0;
  const max = Math.max(...summary.distribution, 1);
  const categories = RATING_CATEGORIES.filter((k) => summary.categories[k] != null);

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
      <div className="flex items-center gap-4 sm:block">
        <p className="text-[56px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-lake-950">
          {formatAverage(average)}
        </p>
        <div className="sm:mt-2">
          <StarRating rating={average} size={20} showNumber={false} />
          <p className="mt-1 text-base text-lake-800">
            <span className="font-semibold tabular-nums text-lake-950">{summary.count}</span>{' '}
            verified review{summary.count === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <ul className="min-w-0 space-y-2" aria-label="How guests rated this boat">
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = summary.distribution[stars - 1];
          return (
            <li key={stars} className="grid grid-cols-[4.25rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm text-lake-800">
              <span className="font-semibold">{stars} star{stars === 1 ? '' : 's'}</span>
              <span aria-hidden className="block h-2.5 overflow-hidden rounded-full bg-lake-100">
                <motion.span
                  initial={reduce || !canObserve ? false : { scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ ...revealSpring, duration: 0.8, delay: (5 - stars) * 0.05 }}
                  style={{ width: `${(n / max) * 100}%` }}
                  className="block h-full origin-left rounded-full bg-sunset-500"
                />
              </span>
              <span className="text-right font-semibold tabular-nums text-lake-950">
                {n}<span className="sr-only"> review{n === 1 ? '' : 's'}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {categories.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-lake-100 pt-5 sm:col-span-2 sm:grid-cols-2">
          {categories.map((k) => {
            const v = summary.categories[k] ?? 0;
            return (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-base text-lake-800">{CATEGORY_LABELS[k]}</dt>
                <dd className="flex items-center gap-2">
                  <StarRating rating={v} size={15} showNumber={false} />
                  <span className="w-8 text-right text-base font-bold tabular-nums text-lake-950">{formatAverage(v)}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
