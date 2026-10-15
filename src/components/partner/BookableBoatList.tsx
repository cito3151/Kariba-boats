import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Info, ShieldCheck } from 'lucide-react';
import BoatImage from '../BoatImage';
import { EmptyState } from '../StateViews';
import { priceView } from '../BoatCard';
import { staggerContainer, staggerItem } from '../motion';
import { portalCard, portalButtonSecondary } from '../portal/styles';
import type { PublicBoat } from '../../services/boats.service';

/**
 * The hotel and agency "Available boats" list: one white card of divided rows,
 * each a boat with its from-price and a book-on-behalf button. On a phone the
 * price and button drop under the name so a long boat name wraps instead of
 * pushing the row sideways. The book button is outlined, not orange: it repeats
 * on every row, and orange is kept for a page's single main action.
 *
 * When booking is off, `disabledReason` is shown once, as a notice above the
 * list, and every disabled button points to it (a tooltip alone never reached
 * touch screens or most screen readers).
 */
export default function BookableBoatList({
  boats, actionLabel, canBook, disabledReason, onBook,
}: {
  boats: PublicBoat[];
  actionLabel: string;
  canBook: boolean;
  /** Why booking is off, shown above the list while `canBook` is false. */
  disabledReason: string;
  onBook: (boat: PublicBoat) => void;
}) {
  const reduce = useReducedMotion();
  const reasonId = useId();

  const notice = !canBook && (
    <p id={reasonId} role="status"
      className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] font-medium leading-normal text-amber-900">
      <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{disabledReason}</span>
    </p>
  );

  if (boats.length === 0) {
    return (
      <>
        {notice}
        <EmptyState large title="No boats found" hint="No approved boats match your search yet." />
      </>
    );
  }

  return (
    <>
      {notice}
      <motion.ul variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show"
        className={`${portalCard} divide-y divide-lake-100 overflow-hidden`}>
        {boats.map((boat) => {
          const price = priceView(boat);
          return (
            <motion.li variants={staggerItem} key={boat.id}
              className="flex items-start gap-3 p-3 transition-colors hover:bg-lake-50/60 sm:items-center sm:gap-4 sm:p-4">
              <BoatImage src={`illustration:${boat.boatType}`} className="h-14 w-20 shrink-0 rounded-md" showBadge={false} />
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="flex items-start gap-1.5 text-base font-semibold leading-snug text-lake-950">
                    <span className="min-w-0 break-words">{boat.name}</span>
                    {boat.operatorVerified && <ShieldCheck size={16} className="mt-0.5 shrink-0 text-lake-600" />}
                  </p>
                  <p className="mt-0.5 break-words text-[15px] leading-snug text-lake-700">{boat.location}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                  {price && (
                    <p className="tabular-nums leading-tight text-lake-950">
                      <span className="text-lg font-bold">${price.amount}</span>
                      <span className="text-sm text-lake-700"> /{price.unit}</span>
                    </p>
                  )}
                  <button
                    onClick={() => onBook(boat)}
                    disabled={!canBook}
                    aria-describedby={canBook ? undefined : reasonId}
                    className={portalButtonSecondary}
                  >
                    {actionLabel}
                  </button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </motion.ul>
    </>
  );
}
