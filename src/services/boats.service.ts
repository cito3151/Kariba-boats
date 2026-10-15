import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { humanizeError } from './errors';

export type BoatKind = 'houseboat' | 'speedboat' | 'fishing' | 'cruiser' | 'pontoon';
export type BoatStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
export type MaintenanceStatus = 'ok' | 'approaching' | 'due' | 'overdue';

export interface BoatInput {
  name: string; boatType: BoatKind; capacity: number; description: string; location: string;
  pricePerHour: number | null; pricePerDay: number | null; depositPercent: number;
  facilities: string[]; safetyEquipment: string[]; crewIncluded: boolean;
  fuelPolicy: 'included' | 'excluded' | 'prepaid' | 'full_to_full';
  registrationNumber: string; maintenanceIntervalHours: number;
  accumulatedHours: number; lastMaintenanceHours: number;
}

export interface OwnerBoat extends BoatInput {
  id: string; ownerId: string; status: BoatStatus; isActive: boolean;
  rejectionReason: string | null; pendingChanges: Record<string, unknown> | null;
  nextMaintenanceHours: number; hoursRemaining: number; maintenanceStatus: MaintenanceStatus;
}

const OWNER_COLS = `id, owner_id, name, boat_type, capacity, description, location,
  price_per_hour, price_per_day, deposit_percent, facilities, safety_equipment, crew_included, fuel_policy,
  registration_number, maintenance_interval_hours, accumulated_hours, last_maintenance_hours,
  next_maintenance_hours, hours_remaining, maintenance_status,
  status, is_active, rejection_reason, pending_changes`;

const BOAT_STATUSES: readonly BoatStatus[] = ['draft', 'pending', 'approved', 'rejected', 'suspended'];
const MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = ['ok', 'approaching', 'due', 'overdue'];

/**
 * status and maintenance_status are plain text columns behind CHECK constraints, so
 * a later migration can widen either without TypeScript noticing (same class of bug
 * companies.service.ts guards against for its own status columns). An unseen value
 * dropped straight into these closed unions would reach the Records the admin and
 * owner dashboards index by status, where the miss throws and white-screens the
 * page. Coercing here keeps the unions honest and degrades to a safe status.
 */
function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toOwnerBoat(r: any): OwnerBoat {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name, boatType: r.boat_type,
    capacity: r.capacity, description: r.description ?? '', location: r.location,
    pricePerHour: r.price_per_hour, pricePerDay: r.price_per_day,
    depositPercent: r.deposit_percent != null ? Number(r.deposit_percent) : 20,
    facilities: r.facilities ?? [], safetyEquipment: r.safety_equipment ?? [],
    crewIncluded: r.crew_included, fuelPolicy: r.fuel_policy,
    registrationNumber: r.registration_number ?? '',
    maintenanceIntervalHours: Number(r.maintenance_interval_hours),
    accumulatedHours: Number(r.accumulated_hours),
    lastMaintenanceHours: Number(r.last_maintenance_hours),
    nextMaintenanceHours: Number(r.next_maintenance_hours),
    hoursRemaining: Number(r.hours_remaining),
    // 'overdue' rather than 'ok': an unknown maintenance state must never read as
    // healthy and quietly drop out of the admin's maintenance-attention queue.
    maintenanceStatus: oneOf(MAINTENANCE_STATUSES, r.maintenance_status, 'overdue'),
    // 'pending' rather than 'approved': an unknown status must never read as
    // approved (surfacing an unreviewed boat as a live public listing) or as
    // already-live; 'pending' routes it back into the review queue instead.
    status: oneOf(BOAT_STATUSES, r.status, 'pending'),
    isActive: r.is_active,
    rejectionReason: r.rejection_reason, pendingChanges: r.pending_changes,
  };
}

export async function listOwnerBoats(ownerId: string): Promise<OwnerBoat[]> {
  const { data, error } = await supabase.from('boats').select(OWNER_COLS)
    .eq('owner_id', ownerId).eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toOwnerBoat);
}

export async function getOwnerBoat(id: string): Promise<OwnerBoat | null> {
  const { data, error } = await supabase.from('boats').select(OWNER_COLS).eq('id', id).single();
  if (error) return null;
  return toOwnerBoat(data);
}

export async function createBoat(ownerId: string, input: BoatInput): Promise<OwnerBoat> {
  const { data, error } = await supabase.from('boats').insert({
    owner_id: ownerId, name: input.name, boat_type: input.boatType,
    capacity: input.capacity, description: input.description, location: input.location,
    price_per_hour: input.pricePerHour, price_per_day: input.pricePerDay,
    deposit_percent: input.depositPercent,
    facilities: input.facilities, safety_equipment: input.safetyEquipment,
    crew_included: input.crewIncluded, fuel_policy: input.fuelPolicy,
    registration_number: input.registrationNumber,
    maintenance_interval_hours: input.maintenanceIntervalHours,
    accumulated_hours: input.accumulatedHours,
    last_maintenance_hours: input.lastMaintenanceHours,
  }).select(OWNER_COLS).single();
  if (error) throw new Error(humanizeError(error.message));
  return toOwnerBoat(data);
}

/**
 * The fields that never change a live (approved) listing directly: they wait in
 * pending_changes for an administrator. Mirrors is_sensitive_change() in the
 * database (migration 36); every other field applies at once.
 */
export const REVIEWED_BOAT_FIELDS: readonly string[] = [
  'name', 'boat_type', 'capacity', 'price_per_hour', 'price_per_day',
  'safety_equipment', 'crew_included', 'registration_number', 'deposit_percent',
];

/** Sends only the changed fields; returns the boat as saved, pending_changes included. */
export async function proposeChanges(id: string, changes: Record<string, unknown>): Promise<OwnerBoat> {
  const { data, error } = await supabase.rpc('propose_boat_changes', {
    p_boat_id: id, p_changes: changes as Json,
  });
  if (error) throw new Error(humanizeError(error.message));
  return toOwnerBoat(data);
}

export async function submitForReview(id: string): Promise<void> {
  const { error } = await supabase.rpc('submit_boat_for_review', { p_boat_id: id });
  if (error) throw new Error(humanizeError(error.message));
}

export async function softDeleteBoat(id: string): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_boat', { p_boat_id: id });
  if (error) throw new Error(humanizeError(error.message));
}

export async function setActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('propose_boat_changes', {
    p_boat_id: id, p_changes: { is_active: isActive },
  });
  if (error) throw new Error(humanizeError(error.message));
}

/* Tourist side */
export interface PublicBoat {
  id: string; ownerId: string; name: string; boatType: BoatKind; capacity: number;
  description: string; location: string; pricePerHour: number | null; pricePerDay: number | null;
  depositPercent: number;
  facilities: string[]; safetyEquipment: string[]; crewIncluded: boolean;
  registrationNumber: string; operatorName: string; operatorPhone: string | null;
  operatorVerified: boolean; operatorTrustScore: number;
}

function toPublicBoat(r: any): PublicBoat {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name, boatType: r.boat_type, capacity: r.capacity,
    description: r.description ?? '', location: r.location,
    pricePerHour: r.price_per_hour, pricePerDay: r.price_per_day,
    depositPercent: r.deposit_percent != null ? Number(r.deposit_percent) : 20,
    facilities: r.facilities ?? [], safetyEquipment: r.safety_equipment ?? [],
    crewIncluded: r.crew_included, registrationNumber: r.registration_number ?? '',
    operatorName: r.operator_name ?? '', operatorPhone: r.operator_phone,
    operatorVerified: r.operator_verified, operatorTrustScore: r.operator_trust_score,
  };
}

export async function listPublicBoats(): Promise<PublicBoat[]> {
  const { data, error } = await supabase.from('public_boats').select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toPublicBoat);
}

export async function getPublicBoat(id: string): Promise<PublicBoat | null> {
  const { data, error } = await supabase.from('public_boats').select('*').eq('id', id).single();
  if (error) return null;
  return toPublicBoat(data);
}

/* Admin side */
export async function listBoatsForAdmin(status?: BoatStatus): Promise<OwnerBoat[]> {
  let q = supabase.from('boats').select(OWNER_COLS).eq('is_deleted', false);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toOwnerBoat);
}

export async function reviewBoat(id: string, action: 'approve' | 'reject' | 'suspend' | 'unsuspend', reason?: string) {
  const { error } = await supabase.rpc('admin_review_boat', {
    p_boat_id: id, p_action: action, p_reason: reason ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function reviewChanges(id: string, approve: boolean, reason?: string) {
  const { error } = await supabase.rpc('admin_review_changes', {
    p_boat_id: id, p_approve: approve, p_reason: reason ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}
