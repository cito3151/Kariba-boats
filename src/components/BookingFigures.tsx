import type { ReactNode } from 'react';
import { tripPrice, tripWhen } from '../services/bookings.service';
import type { BookingRow } from '../services/bookings.service';

/**
 * One labelled figure in a portal card's <dl>: a small uppercase label over its
 * value, the way a booking confirmation lays out its details. Put several in a
 * grid <dl>; BookingFigures is the usual set for a booking.
 */
export function Figure({
  label, children, className = '', valueClassName = 'text-base text-lake-950',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">{label}</dt>
      <dd className={`mt-0.5 break-words ${valueClassName}`}>{children}</dd>
    </div>
  );
}

/**
 * Guest / When / Group / Total for a booking card in the signed-in portals (the
 * same grid the owner's bookings page draws inline). `showGuest` is off on the
 * tourist's own trips, where the guest is the reader. Two columns on a phone; on
 * one row from sm up.
 */
export default function BookingFigures({
  booking: b, showGuest = true,
}: {
  booking: Pick<BookingRow, 'guestName' | 'startDate' | 'days' | 'startTime' | 'durationHours' | 'groupSize' | 'priceTotal'>;
  showGuest?: boolean;
}) {
  return (
    <dl className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-lake-100 pt-3 ${
      showGuest
        ? 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)]'
        : 'sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)]'
    }`}>
      {showGuest && (
        <Figure label="Guest" valueClassName="text-base font-semibold text-lake-950">{b.guestName}</Figure>
      )}
      {/* Without a guest the date gets the phone's full first row, so Group and
          Total share the second instead of one figure sitting alone. */}
      <Figure label="When" className={showGuest ? '' : 'col-span-2 sm:col-span-1'}
        valueClassName="text-base tabular-nums text-lake-950">
        {tripWhen(b)}
      </Figure>
      <Figure label="Group" valueClassName="text-base tabular-nums text-lake-950">
        {b.groupSize} guest{b.groupSize > 1 ? 's' : ''}
      </Figure>
      <Figure label="Total"
        valueClassName={`tabular-nums ${b.priceTotal > 0 ? 'text-lg font-bold text-lake-950' : 'text-base text-lake-700'}`}>
        {tripPrice(b)}
      </Figure>
    </dl>
  );
}
