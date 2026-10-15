import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

/**
 * The team's captain roster (migration 40: captains belong to the company, and
 * owner_id records who added them). Every member reads it; owners and managers
 * maintain it; staff assign roster captains to confirmed bookings.
 */
export interface Captain {
  id: string; ownerId: string; companyId: string; name: string; phone: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCaptain(r: any): Captain {
  return { id: r.id, ownerId: r.owner_id, companyId: r.company_id, name: r.name, phone: r.phone };
}

export async function listCompanyCaptains(companyId: string): Promise<Captain[]> {
  const { data, error } = await supabase.from('captains')
    .select('id, owner_id, company_id, name, phone').eq('company_id', companyId).order('name');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(mapCaptain);
}

/** owner_id is overwritten with the caller by the server (stamp_captain_company). */
export async function createCaptain(companyId: string, ownerId: string, name: string, phone: string): Promise<void> {
  const { error } = await supabase.from('captains')
    .insert({ owner_id: ownerId, company_id: companyId, name, phone });
  if (error) throw new Error(humanizeError(error.message));
}

/**
 * Renames a captain or changes their phone. RLS (captains_update_manager) limits it
 * to owners and managers of the captain's team. Bookings already assigned keep the
 * name and phone they were given: assign_captain copies them onto the booking.
 */
export async function updateCaptain(id: string, name: string, phone: string): Promise<void> {
  const { data, error } = await supabase.from('captains')
    .update({ name, phone }).eq('id', id).select('id');
  if (error) throw new Error(humanizeError(error.message));
  // RLS turns an update of a row you may not change into "0 rows", not an error.
  if (!data || data.length === 0) throw new Error('You cannot change this captain.');
}

export async function deleteCaptain(id: string): Promise<void> {
  const { data, error } = await supabase.from('captains').delete().eq('id', id).select('id');
  if (error) throw new Error(humanizeError(error.message));
  if (!data || data.length === 0) throw new Error('You cannot remove this captain.');
}

export async function assignCaptain(bookingId: string, captainId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_captain', {
    p_booking_id: bookingId, p_captain_id: captainId,
  });
  if (error) throw new Error(humanizeError(error.message));
}
