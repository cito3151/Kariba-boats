import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from 'lucide-react';
import type { Boat, Booking } from '../data/types';
import {
  activeBookingsForBoat,
  bookingCoversDate,
  dayStatus,
  freeGaps,
  minutesToTime,
  timeToMinutes,
  toISODate,
  type DayStatus,
} from '../data/availability';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const statusStyles: Record<DayStatus, string> = {
  free: 'bg-white text-lake-800 border border-lake-100 hover:border-lake-400',
  partial: 'bg-sunset-100 text-sunset-800 border border-sunset-200 hover:border-sunset-400',
  booked: 'bg-lake-700 text-white border border-lake-700',
};

interface Props {
  boat: Boat;
  bookings: Booking[]; // full booking list; filtered internally
  showGuestNames?: boolean; // true on operator/admin views only
}

export default function AvailabilityCalendar({ boat, bookings, showGuestNames = false }: Props) {
  const today = toISODate(new Date());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [selected, setSelected] = useState<string | null>(null);
  const [slideDir, setSlideDir] = useState(1);

  const boatBookings = useMemo(
    () => activeBookingsForBoat(bookings, boat.id),
    [bookings, boat.id],
  );

  const shiftMonth = (delta: number) => {
    setSlideDir(delta);
    setSelected(null);
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

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-lake-950 flex items-center gap-2">
          <CalendarDays size={17} className="text-lake-600" /> Availability
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-full p-1.5 text-lake-500 hover:bg-lake-50 hover:text-lake-800"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[130px] text-center text-sm font-semibold text-lake-900">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-full p-1.5 text-lake-500 hover:bg-lake-50 hover:text-lake-800"
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
          initial={{ opacity: 0, x: slideDir * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: slideDir * -28 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mt-1 grid grid-cols-7 gap-1"
        >
          {Array.from({ length: summary.leadingBlanks }).map((_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {cells.map((c) => (
            <button
              key={c.iso}
              onClick={() => setSelected(c.iso === selected ? null : c.iso)}
              disabled={c.isPast}
              className={`relative aspect-square rounded-lg text-xs font-medium transition-all ${
                c.isPast
                  ? 'text-lake-300 cursor-default'
                  : statusStyles[c.status]
              } ${selected === c.iso ? 'ring-2 ring-sunset-500 ring-offset-1' : ''} ${
                c.iso === today ? 'font-bold underline underline-offset-2' : ''
              }`}
              aria-label={`${c.iso}: ${c.status}`}
            >
              {c.day}
            </button>
          ))}
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
      </div>

      {/* Selected day detail */}
      <AnimatePresence>
        {selectedCell && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
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
