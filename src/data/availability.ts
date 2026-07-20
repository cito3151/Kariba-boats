// Minimal shapes the calendar maths needs, decoupled from any data source.
export interface CalendarBoat {
  id: string;
  priceUnit: 'hour' | 'day' | 'weekend';
}
export interface Booking {
  id: string;
  boatId: string;
  status: string;
  date: string;
  days: number;
  startTime?: string | null;
  durationHours?: number | null;
  touristName?: string;
}
type Boat = CalendarBoat;

// Statuses that block the calendar. 'requested' blocks too (pessimistic hold)
// so two tourists cannot race for the same slot while an operator decides.
export const BLOCKING_STATUSES = ['requested', 'confirmed', 'deposit_paid'] as const;

// Operating window for hourly boats on Kariba (dawn to dusk trips).
export const DAY_START = 6; // 06:00
export const DAY_END = 18; // 18:00

export function isBlocking(b: Booking) {
  return (BLOCKING_STATUSES as readonly string[]).includes(b.status);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toISODate(dt);
}

/** True if `iso` falls inside the booking's blocked day range. */
export function bookingCoversDate(b: Booking, iso: string): boolean {
  return b.date <= iso && iso < addDays(b.date, Math.max(1, b.days));
}

export function activeBookingsForBoat(bookings: Booking[], boatId: string): Booking[] {
  return bookings.filter((b) => b.boatId === boatId && isBlocking(b));
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type DayStatus = 'free' | 'partial' | 'booked';

/** Status of a single calendar day for a boat, given its active bookings. */
export function dayStatus(boat: Boat, dayBookings: Booking[]): DayStatus {
  if (dayBookings.length === 0) return 'free';
  if (boat.priceUnit !== 'hour') return 'booked';
  // Hourly boat: booked solid only if the whole operating window is taken.
  const bookedMinutes = dayBookings.reduce((sum, b) => sum + (b.durationHours ?? 0) * 60, 0);
  return bookedMinutes >= (DAY_END - DAY_START) * 60 ? 'booked' : 'partial';
}

/** Free time gaps within the operating window for an hourly boat on one day. */
export function freeGaps(dayBookings: Booking[]): { start: string; end: string }[] {
  const slots = dayBookings
    .filter((b) => b.startTime && b.durationHours)
    .map((b) => ({
      start: timeToMinutes(b.startTime!),
      end: timeToMinutes(b.startTime!) + b.durationHours! * 60,
    }))
    .sort((a, b) => a.start - b.start);

  const gaps: { start: string; end: string }[] = [];
  let cursor = DAY_START * 60;
  for (const s of slots) {
    if (s.start > cursor) gaps.push({ start: minutesToTime(cursor), end: minutesToTime(s.start) });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < DAY_END * 60) gaps.push({ start: minutesToTime(cursor), end: minutesToTime(DAY_END * 60) });
  return gaps;
}

export interface ConflictCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Checks whether a proposed booking fits the boat's calendar.
 * Day/weekend boats: no overlap of blocked day ranges.
 * Hourly boats: no overlap of time ranges on the same day.
 */
export function checkAvailability(
  boat: Boat,
  existing: Booking[],
  proposal: { date: string; days: number; startTime?: string; durationHours?: number },
): ConflictCheck {
  const active = activeBookingsForBoat(existing, boat.id);
  const propEnd = addDays(proposal.date, Math.max(1, proposal.days));

  for (const b of active) {
    const bEnd = addDays(b.date, Math.max(1, b.days));
    const daysOverlap = proposal.date < bEnd && b.date < propEnd;
    if (!daysOverlap) continue;

    if (boat.priceUnit !== 'hour') {
      return {
        ok: false,
        reason: `This boat is already booked from ${b.date}${b.days > 1 ? ` for ${b.days} days` : ''}. Pick another date.`,
      };
    }

    // Hourly: only a real conflict if the time windows overlap.
    if (!proposal.startTime || !proposal.durationHours || !b.startTime || !b.durationHours) {
      return { ok: false, reason: 'This day already has a booking. Pick another day or time.' };
    }
    const pStart = timeToMinutes(proposal.startTime);
    const pEnd = pStart + proposal.durationHours * 60;
    const bStart = timeToMinutes(b.startTime);
    const bEndMin = bStart + b.durationHours * 60;
    if (pStart < bEndMin && bStart < pEnd) {
      return {
        ok: false,
        reason: `Already booked ${b.startTime} to ${minutesToTime(bEndMin)} that day. Free slots are shown on the calendar.`,
      };
    }
  }
  return { ok: true };
}
