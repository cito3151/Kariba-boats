import { supabase } from '../lib/supabase';

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
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toBookingRow(r: any): BookingRow {
  return {
    id: r.id, boatId: r.boat_id, guestName: r.guest_name, startDate: r.start_date,
    days: r.days, startTime: r.start_time, durationHours: r.duration_hours === null ? null : Number(r.duration_hours),
    status: r.status, priceTotal: Number(r.price_total), depositAmount: Number(r.deposit_amount),
    groupSize: r.group_size, hotelId: r.hotel_id, createdAt: r.created_at,
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
    throw new Error(error.message);
  }
  return { id: data.id, depositAmount: Number(data.deposit_amount) };
}

const BOOKING_COLS =
  'id, boat_id, guest_name, start_date, days, start_time, duration_hours, status, price_total, deposit_amount, group_size, hotel_id, created_at';

export async function listBookingsForBoat(boatId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_COLS).eq('boat_id', boatId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toBookingRow);
}

export async function listBookingsForHotel(hotelId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_COLS)
    .eq('hotel_id', hotelId).order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toBookingRow);
}

export async function setBookingStatus(id: string, status: BookingStatus) {
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
