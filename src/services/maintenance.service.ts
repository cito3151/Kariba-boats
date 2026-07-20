import { supabase } from '../lib/supabase';

export interface HoursEntry {
  id: string; hours: number; readingAfter: number; note: string | null; loggedAt: string;
}
export interface MaintenanceRecord {
  id: string; performedAt: string; hoursAtService: number;
  description: string; cost: number | null; serviceProvider: string | null;
}
export interface MaintenanceNotification {
  id: string; boatId: string; level: 'approaching' | 'due' | 'overdue';
  message: string; isRead: boolean; createdAt: string;
}

export async function logHours(boatId: string, hours: number, note?: string) {
  const { error } = await supabase.rpc('log_operating_hours', {
    p_boat_id: boatId, p_hours: hours, p_note: note ?? undefined, p_booking_id: undefined,
  });
  if (error) throw new Error(error.message);
}

export async function completeMaintenance(
  boatId: string,
  input: { description: string; performedAt?: string; cost?: number | null; serviceProvider?: string | null },
) {
  const { error } = await supabase.rpc('complete_maintenance', {
    p_boat_id: boatId, p_description: input.description,
    p_performed_at: input.performedAt ?? new Date().toISOString().slice(0, 10),
    p_cost: input.cost ?? undefined, p_service_provider: input.serviceProvider ?? undefined,
  });
  if (error) throw new Error(error.message);
}

export async function listHours(boatId: string): Promise<HoursEntry[]> {
  const { data, error } = await supabase.from('boat_operating_hours')
    .select('id, hours, reading_after, note, logged_at')
    .eq('boat_id', boatId).order('logged_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, hours: Number(r.hours), readingAfter: Number(r.reading_after),
    note: r.note, loggedAt: r.logged_at,
  }));
}

export async function listMaintenance(boatId: string): Promise<MaintenanceRecord[]> {
  const { data, error } = await supabase.from('boat_maintenance_records')
    .select('id, performed_at, hours_at_service, description, cost, service_provider')
    .eq('boat_id', boatId).order('performed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, performedAt: r.performed_at, hoursAtService: Number(r.hours_at_service),
    description: r.description, cost: r.cost === null ? null : Number(r.cost),
    serviceProvider: r.service_provider,
  }));
}

export async function listNotifications(): Promise<MaintenanceNotification[]> {
  const { data, error } = await supabase.from('maintenance_notifications')
    .select('id, boat_id, level, message, is_read, created_at')
    .order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, boatId: r.boat_id, level: r.level as MaintenanceNotification['level'], message: r.message,
    isRead: r.is_read, createdAt: r.created_at,
  }));
}

export async function markNotificationRead(id: string) {
  await supabase.from('maintenance_notifications').update({ is_read: true }).eq('id', id);
}
