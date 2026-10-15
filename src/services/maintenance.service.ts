import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface HoursEntry {
  id: string; hours: number; readingAfter: number; note: string | null; loggedAt: string;
  loggedBy: string;
  /** Set when the entry was corrected (migration 38); its hours no longer count. */
  voidedAt: string | null;
  voidReason: string | null;
}
export interface MaintenanceRecord {
  id: string; performedAt: string; hoursAtService: number;
  description: string; cost: number | null; serviceProvider: string | null;
  /** When the record was written (not the service date the owner chose). */
  createdAt: string;
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

/**
 * Voids a mistaken hours entry and takes its hours back off the boat's total
 * (void_operating_hours, migration 38). The reason is required and kept on the
 * entry, which stays in the log struck through. The server decides who may:
 * the owner for an entry they logged in the last 24 hours with no service
 * recorded since (canOwnerCorrect mirrors that for the UI), an admin for any.
 */
export async function voidOperatingHours(
  entryId: string, reason: string,
): Promise<{ accumulatedHours: number; maintenanceStatus: string | null }> {
  const { data, error } = await supabase.rpc('void_operating_hours', { p_entry_id: entryId, p_reason: reason });
  if (error) throw new Error(humanizeError(error.message));
  return { accumulatedHours: Number(data.accumulated_hours), maintenanceStatus: data.maintenance_status };
}

const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether the owner rule of void_operating_hours lets this user correct this entry at `now`. */
export function canOwnerCorrect(
  entry: HoursEntry, userId: string, records: MaintenanceRecord[], now: number,
): boolean {
  if (entry.voidedAt || entry.loggedBy !== userId) return false;
  const loggedAt = new Date(entry.loggedAt).getTime();
  if (now - loggedAt >= CORRECTION_WINDOW_MS) return false;
  return !records.some((r) => new Date(r.createdAt).getTime() > loggedAt);
}

export async function listHours(boatId: string): Promise<HoursEntry[]> {
  const { data, error } = await supabase.from('boat_operating_hours')
    .select('id, hours, reading_after, note, logged_at, logged_by, voided_at, void_reason')
    .eq('boat_id', boatId).order('logged_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, hours: Number(r.hours), readingAfter: Number(r.reading_after),
    note: r.note, loggedAt: r.logged_at, loggedBy: r.logged_by,
    voidedAt: r.voided_at, voidReason: r.void_reason,
  }));
}

export async function listMaintenance(boatId: string): Promise<MaintenanceRecord[]> {
  const { data, error } = await supabase.from('boat_maintenance_records')
    .select('id, performed_at, hours_at_service, description, cost, service_provider, created_at')
    .eq('boat_id', boatId).order('performed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, performedAt: r.performed_at, hoursAtService: Number(r.hours_at_service),
    description: r.description, cost: r.cost === null ? null : Number(r.cost),
    serviceProvider: r.service_provider, createdAt: r.created_at,
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
