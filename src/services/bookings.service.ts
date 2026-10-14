import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';
import type { Booking } from '../data/availability';

export type BookingStatus =
  | 'requested' | 'confirmed' | 'deposit_paid' | 'completed' | 'declined' | 'cancelled';

export interface BookingInput {
  boatId: string; guestName: string; guestPhone: string; startDate: string;
  days: number; startTime: string | null; durationHours: number | null;
  groupSize: number; experienceType: string; priceTotal: number; depositAmount: number;
  hotelId?: string | null; notes?: string;
  waiverVersion: number; waiverAccepted: boolean;
}

export interface BookingRow {
  /** Customer-facing reference, e.g. KLC-7H3QXK (migration 31). Assigned by the server. */
  id: string; reference: string; boatId: string; guestName: string; startDate: string; days: number;
  startTime: string | null; durationHours: number | null; status: BookingStatus;
  priceTotal: number; depositAmount: number; groupSize: number; hotelId: string | null;
  createdAt: string; boatName: string; boatLocation: string;
  captainName: string | null; captainPhone: string | null;
}

const BOOKING_SELECT =
  'id, reference, boat_id, guest_name, start_date, days, start_time, duration_hours, status, price_total, deposit_amount, group_size, hotel_id, captain_name, captain_phone, created_at, boats(name, location)';

/* eslint-disable @typescript-eslint/no-explicit-any */
function toBookingRow(r: any): BookingRow {
  return {
    id: r.id, reference: r.reference ?? '', boatId: r.boat_id, guestName: r.guest_name, startDate: r.start_date,
    days: r.days, startTime: r.start_time,
    durationHours: r.duration_hours === null ? null : Number(r.duration_hours),
    status: r.status, priceTotal: Number(r.price_total), depositAmount: Number(r.deposit_amount),
    groupSize: r.group_size, hotelId: r.hotel_id, createdAt: r.created_at,
    boatName: r.boats?.name ?? 'Boat', boatLocation: r.boats?.location ?? '',
    captainName: r.captain_name ?? null, captainPhone: r.captain_phone ?? null,
  };
}

/** One-line "when" for a booking: date and hours for an hourly trip, date and days otherwise. */
export function tripWhen(b: Pick<BookingRow, 'startDate' | 'days' | 'startTime' | 'durationHours'>): string {
  if (b.startTime && b.durationHours) return `${b.startDate} at ${b.startTime} (${b.durationHours}h)`;
  return `${b.startDate}, ${b.days} day${b.days > 1 ? 's' : ''}`;
}

/** The booking's total, or a plain note for requests saved before prices were recorded (stored as 0). */
export function tripPrice(b: Pick<BookingRow, 'priceTotal'>): string {
  return b.priceTotal > 0 ? `$${b.priceTotal}` : 'no price recorded';
}

export async function createBooking(input: BookingInput, touristId: string | null) {
  void touristId; // tourist_id is derived server-side in create_booking
  const { data, error } = await supabase.rpc('create_booking', {
    p_boat_id: input.boatId, p_guest_name: input.guestName, p_guest_phone: input.guestPhone,
    p_hotel_id: input.hotelId ?? undefined,
    p_start_date: input.startDate, p_days: input.days,
    p_start_time: input.startTime ?? undefined, p_duration_hours: input.durationHours ?? undefined,
    p_group_size: input.groupSize, p_experience_type: input.experienceType,
    p_price_total: input.priceTotal, p_deposit_amount: input.depositAmount,
    p_notes: input.notes ?? undefined,
    p_waiver_version: input.waiverVersion, p_waiver_accepted: input.waiverAccepted,
  }).single();
  if (error) throw new Error(humanizeError(error.message));
  const row = data as { id: string; deposit_amount: number; reference?: string | null };
  return { id: row.id, depositAmount: Number(row.deposit_amount), reference: row.reference ?? undefined };
}

export async function listBookingsForBoat(boatId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('boat_id', boatId);
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toBookingRow);
}

/**
 * Busy periods for the public availability calendar, mapped into the calendar's own
 * Booking shape so dayStatus / bookingCoversDate / checkAvailability work unchanged.
 *
 * listBookingsForBoat cannot serve this: RLS (bookings_read_involved) hides other
 * customers' bookings, so a tourist or logged-out visitor got no rows and the
 * calendar showed every day free. boat_busy_periods (migration 30) is a narrow
 * SECURITY DEFINER read that returns dates and hours only, never guest details. It
 * has no ids, so each row gets a local key, and guest names stay undefined.
 *
 * If the function is not deployed yet, or the call fails, fall back to the plain
 * table read: owners and admins still see their own bookings, and a tourist gets the
 * same empty calendar as before rather than an error page. The server's overlap
 * constraint stays the final word either way.
 */
export async function listBusyPeriodsForBoat(boatId: string): Promise<Booking[]> {
  const { data, error } = await supabase.rpc('boat_busy_periods', { p_boat_id: boatId });
  if (!error) {
    return (data ?? []).map((r, i) => ({
      id: `busy-${i}`, boatId, status: r.status, date: r.start_date, days: r.days,
      startTime: r.start_time ?? null,
      durationHours: r.duration_hours === null ? null : Number(r.duration_hours),
    }));
  }
  const rows = await listBookingsForBoat(boatId);
  return rows.map(toCalendarBooking);
}

/** BookingRow (owner/admin view, with guest names) to the calendar's Booking shape. */
export function toCalendarBooking(b: BookingRow): Booking {
  return {
    id: b.id, boatId: b.boatId, status: b.status, date: b.startDate, days: b.days,
    startTime: b.startTime, durationHours: b.durationHours, touristName: b.guestName,
  };
}

export async function listBookingsForHotel(hotelId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .eq('hotel_id', hotelId).order('start_date', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toBookingRow);
}

export async function listBookingsForAgency(agencyId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .eq('agency_id', agencyId).order('start_date', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toBookingRow);
}

export async function listMyBookings(touristId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .eq('tourist_id', touristId).order('start_date', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toBookingRow);
}

export async function listBookingsForOwner(ownerId: string): Promise<BookingRow[]> {
  // RLS bookings_read_involved already restricts reads to the owner's boats;
  // filter by owned boat ids so the query is explicit.
  const { data: boats, error: bErr } = await supabase.from('boats')
    .select('id').eq('owner_id', ownerId).eq('is_deleted', false);
  if (bErr) throw new Error(bErr.message);
  const ids = (boats ?? []).map((b) => b.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .in('boat_id', ids).order('start_date', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toBookingRow);
}

export async function listAllBookings(): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .order('start_date', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toBookingRow);
}

// Owner (or admin) status transitions go through the RPC, which enforces the
// legal transition graph. Direct table updates are revoked.
export async function setOwnerBookingStatus(id: string, status: BookingStatus) {
  const { error } = await supabase.rpc('owner_set_booking_status', { p_booking_id: id, p_status: status });
  if (error) throw new Error(humanizeError(error.message));
}

export async function cancelBooking(id: string) {
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: id });
  if (error) throw new Error(humanizeError(error.message));
}

/** What the public tracker shows: status and trip logistics, never the guest's name or phone. */
export interface TrackedBooking {
  reference: string; status: BookingStatus; boatName: string; boatLocation: string;
  startDate: string; startTime: string | null; days: number; durationHours: number | null;
  groupSize: number; priceTotal: number; depositAmount: number; createdAt: string;
}

/**
 * Look a booking up by its reference and the phone number it was booked with, for
 * the public /track page. track_booking (migration 31) answers only when both
 * match, so null means "no booking with those details", whichever part was wrong.
 */
export async function trackBooking(reference: string, phone: string): Promise<TrackedBooking | null> {
  const { data, error } = await supabase.rpc('track_booking', { p_reference: reference, p_phone: phone });
  if (error) throw new Error(humanizeError(error.message));
  const r = data?.[0];
  if (!r) return null;
  return {
    reference: r.reference, status: r.status, boatName: r.boat_name, boatLocation: r.boat_location ?? '',
    startDate: r.start_date, startTime: r.start_time ?? null, days: r.days,
    durationHours: r.duration_hours === null ? null : Number(r.duration_hours),
    groupSize: r.group_size, priceTotal: Number(r.price_total), depositAmount: Number(r.deposit_amount),
    createdAt: r.created_at,
  };
}
