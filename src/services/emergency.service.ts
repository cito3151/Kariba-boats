import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface EmergencyContact {
  id: string; name: string; role: string; phone: string; sortOrder: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapContact(r: any): EmergencyContact {
  return { id: r.id, name: r.name, role: r.role, phone: r.phone, sortOrder: r.sort_order };
}

export async function listEmergencyContacts(): Promise<EmergencyContact[]> {
  const { data, error } = await supabase.from('emergency_contacts')
    .select('id, name, role, phone, sort_order').order('sort_order').order('created_at');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(mapContact);
}

export async function createEmergencyContact(input: { name: string; role: string; phone: string; sortOrder: number }): Promise<void> {
  const { error } = await supabase.from('emergency_contacts').insert({
    name: input.name, role: input.role, phone: input.phone, sort_order: input.sortOrder,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function updateEmergencyContact(id: string, input: { name: string; role: string; phone: string; sortOrder: number }): Promise<void> {
  const { error } = await supabase.from('emergency_contacts').update({
    name: input.name, role: input.role, phone: input.phone, sort_order: input.sortOrder,
  }).eq('id', id);
  if (error) throw new Error(humanizeError(error.message));
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
  if (error) throw new Error(humanizeError(error.message));
}
