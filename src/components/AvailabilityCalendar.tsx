import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, Clock, AlertCircle } from 'lucide-react';
import {
  activeBookingsForBoat,
  bookingCoversDate,
  checkRangeSelectable,
  dayStatus,
  freeGaps,
  inclusiveDays,
  minutesToTime,
  timeToMinutes,
  toISODate,
  type DayStatus,
  type CalendarBoat,
  type Booking,
} from '../data/availability';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A picked range. `end` is null while only the start day has been tapped. Hourly
 * boats take a single date, so there start and end are the same day.
 */
export interface DateRange {
  start: string;
  end: string | null;
}

const statusStyles: Record<DayStatus, string> = {
  free: 'bg-white text-lake-800 border border-lake-100 hover:border-lake-400',
  partial: 'bg-sunset-100 text-sunset-800 border border-sunset-200 hover:border-sunset-400',
  // Struck through as well as dark, so booked does not rest on colour alone.
  booked: 'bg-lake-700 text-white border border-lake-700 line-through decoration-1',
};

// Start and end are solid; days between are a light tint. sunset-700 rather than 500
// so white text clears 4.5:1. The tint is never confused with "partly booked"
// (also sunset-100) because partly booked only exists on single-date hourly boats.
const startEndStyle = 'bg-sunset-700 text-white border border-sunset-700 font-bold hover:bg-sunset-800';
const inRangeStyle = 'bg-sunset-100 text-sunset-900 border border-sunset-300 hover:border-sunset-500';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake-800 focus-visible:ring-offset-2';

function parseISO(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** "12 June", with the year only when it is not the current one. */
function formatDay(iso: string, withYear = false) {
  const { y, m, d } = parseISO(iso);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** "12 to 14 June", "30 June to 2 July", or "28 December 2026 to 2 January 2027". */
function formatRange(startIso: string, endIso: string, thisYear: number) {
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  if (s.y !== e.y) return `${formatDay(startIso, true)} to ${formatDay(endIso, true)}`;
  const yearSuffix = e.y !== thisYear ? ` ${e.y}` : '';
  if (s.m === e.m) return `${s.d} to ${e.d} ${MONTHS[e.m - 1]}${yearSuffix}`;
  return `${s.d} ${MONTHS[s.m - 1]} to ${e.d} ${MONTHS[e.m - 1]}${yearSuffix}`;
}

function longDate(iso: string) {
  const { y, m, d } = parseISO(iso);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

interface Props {
  boat: CalendarBoat;
  bookings: Booking[]; // full booking list; filtered internally
  showGuestNames?: boolean; // true on operator/admin views only
  /**
   * Range selection is opt-in: it switches on when `onRangeChange` is given. Without
   * it the calendar behaves as a read-only availability view. Hourly boats
   * (priceUnit 'hour') select one date; day and weekend boats select a start and
   * an end day, inclusive.
   */
  selectedRange?: DateRange | null;
  onRangeChange?: (range: DateRange | null) => void;
}

export default function AvailabilityCalendar({
  boat, bookings, showGuestNames = false, selectedRange = null, onRangeChange,
}: Props) {
  const reduce = useReducedMotion();
  const today = toISODate(new Date());
  const thisYear = new Date().getFullYear();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [selected, setSelected] = useState<string | null>(null);
  const [slideDir, setSlideDir] = useState(1);
  const [notice, setNotice] = useState('');

  const selectable = Boolean(onRangeChange);
  const singleDate = boat.priceUnit === 'hour';

  const boatBookings = useMemo(
    () => activeBookingsForBoat(bookings, boat.id),
    [bookings, boat.id],
  );

  const shiftMonth = (delta: number) => {
    setSlideDir(delta);
    setSelected(null);
    setNotice('');
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  // Build the day grid for the viewed month.
  const { cells, summary } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Monday-first offset
    const leadingBlanks = (firstDay.getDay() + 6) % 7;

    const cells: { iso: string; day: number; status: DayStatus; isPast: boolean; dayBookings: Booking[] }[] = [];
    let bookedCount = 0;
    let partialCount = 0;
    let freeCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toISODate(new Date(viewYear, viewMonth, d));
      const dayBookings = boatBookings.filter((b) => bookingCoversDate(b, iso));
      const status = dayStatus(boat, dayBookings);
      const isPast = iso < today;
      cells.push({ iso, day: d, status, isPast, dayBookings });
      if (!isPast) {
        if (status === 'booked') bookedCount++;
        else if (status === 'partial') partialCount++;
        else freeCount++;
      }
    }
    return { cells, summary: { bookedCount, partialCount, freeCount, leadingBlanks } };
  }, [viewYear, viewMonth, boatBookings, boat, today]);

  const selectedCell = selected ? cells.find((c) => c.iso === selected) : null;

  const rangeStart = selectable ? selectedRange?.start ?? null : null;
  const rangeEnd = selectable ? selectedRange?.end ?? null : null;

  const handleDayClick = (c: (typeof cells)[number]) => {
    if (!selectable || !onRangeChange) {
      setSelected(c.iso === selected ? null : c.iso);
      return;
    }
    setNotice('');
    // The detail panel is for days that have something to tell: who or when is booked.
    setSelected(c.dayBookings.length > 0 ? c.iso : null);

    if (c.status === 'booked') {
      setNotice(
        rangeStart && rangeEnd === null && !singleDate
          ? `${formatDay(c.iso)} is booked. Your start day, ${formatDay(rangeStart)}, is kept. Pick a different end day.`
          : `${formatDay(c.iso)} is booked and cannot be selected.`,
      );
      return;
    }
    if (singleDate) {
      onRangeChange(rangeStart === c.iso ? null : { start: c.iso, end: c.iso });
      return;
    }
    if (c.iso === rangeStart) {
      onRangeChange(null);
      return;
    }
    if (rangeStart && rangeEnd === null && c.iso > rangeStart) {
      const check = checkRangeSelectable(boat, boatBookings, rangeStart, c.iso, today);
      if (!check.ok) {
        setNotice(`${check.reason} Your start day, ${formatDay(rangeStart)}, is kept. Pick a different end day.`);
        return;
      }
      onRangeChange({ start: rangeStart, end: c.iso });
      return;
    }
    // First tap, or a tap earlier than the start, or a tap after a finished range.
    onRangeChange({ start: c.iso, end: null });
  };

  const clearRange = () => {
    setNotice('');
    onRangeChange?.(null);
  };

  const describeBooking = (b: Booking) => {
    const who = showGuestNames ? b.touristName : 'Booked';
    if (boat.priceUnit === 'hour' && b.startTime && b.durationHours) {
      const end = minutesToTime(timeToMinutes(b.startTime) + b.durationHours * 60);
      return `${who}: ${b.startTime} to ${end} (${b.durationHours}h)`;
    }
    if (b.days > 1) {
      return `${who}: ${b.days} day trip starting ${b.date}`;
    }
    return `${who}: full day`;
  };

  // Accessible name: the date, then its status, then where it sits in the selection.
  const cellLabel = (c: (typeof cells)[number]) => {
    const parts = [longDate(c.iso)];
    if (c.isPast) parts.push('past date, not available');
    else if (c.status === 'booked') parts.push(selectable ? 'booked, cannot be selected' : 'booked');
    else if (c.status === 'partial') parts.push('partly booked, some hours free');
    else parts.push('free');

    if (selectable && rangeStart) {
      if (c.iso === rangeStart && (rangeEnd === null || rangeEnd === rangeStart)) {
        parts.push(singleDate ? 'selected' : rangeEnd === null ? 'selected as start day, now choose an end day' : 'selected as start and end day');
      } else if (c.iso === rangeStart) parts.push('selected as start day');
      else if (rangeEnd && c.iso === rangeEnd) parts.push('selected as end day');
      else if (rangeEnd && c.iso > rangeStart && c.iso < rangeEnd) parts.push('in the selected range');
    }
    return parts.join(', ');
  };

  // Summary line under the calendar.
  let summaryText = '';
  let summaryHint = '';
  if (selectable) {
    if (!rangeStart) {
      summaryText = singleDate ? 'No date selected' : 'No dates selected';
      summaryHint = singleDate
        ? 'Tap the day you want to go out. You choose the time when you book.'
        : 'Tap a start day, then an end day. Tap the start day again to clear.';
    } else if (singleDate) {
      summaryText = formatDay(rangeStart, parseISO(rangeStart).y !== thisYear);
      summaryHint = 'You choose the start time and length when you book.';
    } else if (rangeEnd === null) {
      summaryText = `Start: ${formatDay(rangeStart, parseISO(rangeStart).y !== thisYear)}`;
      summaryHint = 'Now tap an end day, or book just this one day.';
    } else {
      const n = inclusiveDays(rangeStart, rangeEnd);
      summaryText = `${n} day${n !== 1 ? 's' : ''}, ${n === 1 ? formatDay(rangeStart, parseISO(rangeStart).y !== thisYear) : formatRange(rangeStart, rangeEnd, thisYear)}`;
      summaryHint = 'Start and end days are both included.';
    }
  }

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-lake-950 flex items-center gap-2">
          <CalendarDays size={17} className="text-lake-600" /> Availability
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className={`rounded-full p-1.5 text-lake-500 hover:bg-lake-50 hover:text-lake-800 ${focusRing}`}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[130px] text-center text-sm font-semibold text-lake-900" aria-live="polite">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className={`rounded-full p-1.5 text-lake-500 hover:bg-lake-50 hover:text-lake-800 ${focusRing}`}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Month summary */}
      <p className="mt-1 text-xs text-lake-500">
        {summary.bookedCount} day{summary.bookedCount !== 1 ? 's' : ''} booked
        {boat.priceUnit === 'hour' && summary.partialCount > 0 && (
          <>, {summary.partialCount} partly booked</>
        )}
        , {summary.freeCount} still free this month.
      </p>

      {/* Weekday header */}
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-lake-400">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      {/* Day grid */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${viewYear}-${viewMonth}`}
          initial={{ opacity: 0, x: reduce ? 0 : slideDir * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduce ? 0 : slideDir * -28 }}
          transition={{ duration: reduce ? 0.15 : 0.25, ease: 'easeOut' }}
          className="mt-1 grid grid-cols-7 gap-1"
        >
          {Array.from({ length: summary.leadingBlanks }).map((_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {cells.map((c) => {
            const isStart = selectable && c.iso === rangeStart;
            const isEnd = selectable && rangeEnd !== null && c.iso === rangeEnd;
            const inRange =
              selectable && rangeStart !== null && rangeEnd !== null && c.iso > rangeStart && c.iso < rangeEnd;
            const isPicked = isStart || isEnd;
            // A booked day cannot be picked, but stays tappable so its booked
            // times can still be read. aria-disabled says so without hiding it.
            const blocked = selectable && !c.isPast && c.status === 'booked';

            let tone = statusStyles[c.status];
            if (c.isPast) tone = 'text-lake-300 cursor-default';
            else if (isPicked) tone = startEndStyle;
            else if (inRange) tone = inRangeStyle;

            return (
              <button
                key={c.iso}
                type="button"
                onClick={() => handleDayClick(c)}
                disabled={c.isPast}
                aria-disabled={blocked || undefined}
                aria-pressed={selectable && !c.isPast && !blocked ? isPicked || inRange : undefined}
                className={`relative aspect-square rounded-lg text-xs font-medium transition-colors ${focusRing} ${tone} ${
                  !selectable && selected === c.iso ? 'ring-2 ring-sunset-500 ring-offset-1' : ''
                } ${c.iso === today ? 'font-bold underline underline-offset-2' : ''}`}
                aria-label={cellLabel(c)}
              >
                {c.day}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-lake-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-lake-200 bg-white" /> Free
        </span>
        {boat.priceUnit === 'hour' && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-sunset-100 border border-sunset-300" /> Partly booked
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-lake-700" /> Booked
        </span>
        {selectable && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-sunset-700" /> {singleDate ? 'Selected' : 'Start and end'}
            </span>
            {!singleDate && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-sunset-300 bg-sunset-100" /> In between
              </span>
            )}
          </>
        )}
      </div>

      {/* Selection summary */}
      {selectable && (
        <div className="mt-3 rounded-xl border border-lake-100 bg-lake-50 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div role="status" aria-live="polite" className="min-w-0">
              <p className="font-semibold text-lake-900">{summaryText}</p>
              <p className="mt-0.5 text-xs text-lake-600">{summaryHint}</p>
            </div>
            {rangeStart && (
              <div className="flex shrink-0 items-center gap-2">
                {!singleDate && rangeEnd === null && (
                  <button
                    type="button"
                    onClick={() => onRangeChange?.({ start: rangeStart, end: rangeStart })}
                    className={`min-h-8 rounded-lg border border-lake-200 bg-white px-3 text-xs font-semibold text-lake-800 hover:bg-lake-50 ${focusRing}`}
                  >
                    Just this day
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearRange}
                  className={`min-h-8 rounded-lg px-3 text-xs font-semibold text-lake-700 underline underline-offset-2 hover:text-lake-900 ${focusRing}`}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {notice && (
            <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {notice}
            </p>
          )}
        </div>
      )}

      {/* Selected day detail */}
      <AnimatePresence>
        {selectedCell && (
          <motion.div
            initial={{ opacity: 0, height: reduce ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: reduce ? 'auto' : 0 }}
            transition={{ duration: reduce ? 0.15 : 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl bg-lake-50 p-3 text-sm">
              <p className="font-semibold text-lake-900 flex items-center gap-1.5">
                <Clock size={14} className="text-lake-500" /> {selectedCell.iso}
              </p>

              {selectedCell.dayBookings.length === 0 ? (
                <p className="mt-1 text-lake-600">
                  {boat.priceUnit === 'hour'
                    ? 'Free all day, 06:00 to 18:00.'
                    : 'Free. This date can be booked.'}
                </p>
              ) : (
                <>
                  <ul className="mt-1.5 space-y-1 text-lake-700">
                    {selectedCell.dayBookings.map((b) => (
                      <li key={b.id} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-lake-700" />
                        {describeBooking(b)}
                        {b.status === 'requested' && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            awaiting confirmation
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {boat.priceUnit === 'hour' &&
                    selectedCell.status === 'partial' &&
                    freeGaps(selectedCell.dayBookings).length > 0 && (
                      <p className="mt-2 text-xs text-emerald-700">
                        Free:{' '}
                        {freeGaps(selectedCell.dayBookings)
                          .map((g) => `${g.start} to ${g.end}`)
                          .join(', ')}
                      </p>
                    )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
