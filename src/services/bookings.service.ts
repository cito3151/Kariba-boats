import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export type BookingStatus =
  | 'requested' | 'confirmed' | 'deposit_paid' | 'completed' | 'declined' | 'cancelled';

export interface BookingInput {
  boatId: string; guestName: string; guestPhone: string; startDate: string;
  days: number; startTime: string | null; durationHours: number | null;
  groupSize: number; experienceType: string; priceTotal: number; depositAmount: number;
  hotelId?: string | null; notes?: string;
}

export interface BookingRow {
  id: string; boatId: string; guestName: string; startDate: string; days: number;
  startTime: string | null; durationHours: number | null; status: BookingStatus;
  priceTotal: number; depositAmount: number; groupSize: number; hotelId: string | null;
  createdAt: string; boatName: string; boatLocation: string;
}

const BOOKING_SELECT =
  'id, boat_id, guest_name, start_date, days, start_time, duration_hours, status, price_total, deposit_amount, group_size, hotel_id, created_at, boats(name, location)';

/* eslint-disable @typescript-eslint/no-explicit-any */
function toBookingRow(r: any): BookingRow {
  return {
    id: r.id, boatId: r.boat_id, guestName: r.guest_name, startDate: r.start_date,
    days: r.days, startTime: r.start_time,
    durationHours: r.duration_hours === null ? null : Number(r.duration_hours),
    status: r.status, priceTotal: Number(r.price_total), depositAmount: Number(r.deposit_amount),
    groupSize: r.group_size, hotelId: r.hotel_id, createdAt: r.created_at,
    boatName: r.boats?.name ?? 'Boat', boatLocation: r.boats?.location ?? '',
  };
}

export async function createBooking(input: BookingInput, touristId: string | null) {
  const { data, error } = await supabase.from('bookings').insert({
    boat_id: input.boatId, tourist_id: touristId, hotel_id: input.hotelId ?? null,
    guest_name: input.guestName, guest_phone: input.guestPhone,
    start_date: input.startDate, days: input.days,
    start_time: input.startTime, duration_hours: input.durationHours,
    group_size: input.groupSize, experience_type: input.experienceType,
    price_total: input.priceTotal, deposit_amount: input.depositAmount,
    notes: input.notes ?? null,
  }).select('id, deposit_amount').single();

  if (error) {
    // 23P01 is exclusion_violation: the slot was taken between render and submit.
    if (error.code === '23P01') {
      throw new Error('That slot was just booked by someone else. Pick another time.');
    }
    throw new Error(humanizeError(error.message));
  }
  return { id: data.id, depositAmount: Number(data.deposit_amount) };
}

export async function listBookingsForBoat(boatId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('boat_id', boatId);
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toBookingRow);
}

export async function listBookingsForHotel(hotelId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .eq('hotel_id', hotelId).order('start_date', { ascending: false });
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
