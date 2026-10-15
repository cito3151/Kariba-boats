import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface Captain {
  id: string; ownerId: string; name: string; phone: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCaptain(r: any): Captain {
  return { id: r.id, ownerId: r.owner_id, name: r.name, phone: r.phone };
}

export async function listMyCaptains(ownerId: string): Promise<Captain[]> {
  const { data, error } = await supabase.from('captains')
    .select('id, owner_id, name, phone').eq('owner_id', ownerId).order('name');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(mapCaptain);
}

export async function createCaptain(ownerId: string, name: string, phone: string): Promise<void> {
  const { error } = await supabase.from('captains').insert({ owner_id: ownerId, name, phone });
  if (error) throw new Error(humanizeError(error.message));
}

/**
 * Renames a captain or changes their phone. RLS (captains_owner_all) limits it to
 * the owner's own roster. Bookings already assigned keep the name and phone they
 * were given: assign_captain copies them onto the booking.
 */
export async function updateCaptain(id: string, name: string, phone: string): Promise<void> {
  const { data, error } = await supabase.from('captains')
    .update({ name, phone }).eq('id', id).select('id');
  if (error) throw new Error(humanizeError(error.message));
  // RLS turns an update of someone else's row into "0 rows", not an error.
  if (!data || data.length === 0) throw new Error('That captain is not on your roster.');
}

export async function deleteCaptain(id: string): Promise<void> {
  const { error } = await supabase.from('captains').delete().eq('id', id);
  if (error) throw new Error(humanizeError(error.message));
}

export async function assignCaptain(bookingId: string, captainId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_captain', {
    p_booking_id: bookingId, p_captain_id: captainId,
  });
  if (error) throw new Error(humanizeError(error.message));
}
