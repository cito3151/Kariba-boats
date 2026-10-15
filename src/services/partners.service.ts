import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

// Hotels and travel agencies (the partner organisations) and the hotel and
// agency user accounts linked to them. Admin only: writes need the
// hotels_write_admin / agencies_write_admin policies, and linking goes through
// admin_link_partner (migration 37). There is no delete: bookings and profiles
// reference these rows, so an organisation is deactivated (is_verified = false),
// which stops new bookings for it (guard_hotel_booking) and keeps its history.

export type PartnerKind = 'hotel' | 'agency';

export interface PartnerOrg {
  id: string;
  kind: PartnerKind;
  name: string;
  location: string;
  commissionRate: number;
  /** Stored as is_verified. False means deactivated. */
  isActive: boolean;
  createdAt: string;
}

export interface PartnerOrgInput {
  name: string;
  location: string;
  commissionRate: number;
  isActive?: boolean;
}

export interface PartnerUser {
  id: string;
  kind: PartnerKind;
  fullName: string;
  businessName: string | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  /** The hotel_id or agency_id, whichever matches the account's role. */
  orgId: string | null;
}

const TABLE: Record<PartnerKind, 'hotels' | 'agencies'> = { hotel: 'hotels', agency: 'agencies' };
const ORG_SELECT = 'id, name, location, commission_rate, is_verified, created_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOrg(kind: PartnerKind, r: any): PartnerOrg {
  return {
    id: r.id, kind, name: r.name, location: r.location,
    commissionRate: Number(r.commission_rate), isActive: r.is_verified, createdAt: r.created_at,
  };
}

export const COMMISSION_MIN = 0;
export const COMMISSION_MAX = 30;

/** The same rules the database enforces, checked first so the form can say which field is wrong. */
export function validateOrgInput(input: PartnerOrgInput): string | null {
  if (input.name.trim().length < 2) return 'Enter a name.';
  if (input.location.trim().length < 2) return 'Enter a location.';
  if (!Number.isFinite(input.commissionRate)
      || input.commissionRate < COMMISSION_MIN || input.commissionRate > COMMISSION_MAX) {
    return `Commission must be between ${COMMISSION_MIN} and ${COMMISSION_MAX} percent.`;
  }
  return null;
}

export async function listPartnerOrgs(kind: PartnerKind): Promise<PartnerOrg[]> {
  const { data, error } = await supabase.from(TABLE[kind]).select(ORG_SELECT).order('name');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => mapOrg(kind, r));
}

export async function createPartnerOrg(kind: PartnerKind, input: PartnerOrgInput): Promise<PartnerOrg> {
  const problem = validateOrgInput(input);
  if (problem) throw new Error(problem);
  const { data, error } = await supabase.from(TABLE[kind]).insert({
    name: input.name.trim(),
    location: input.location.trim(),
    commission_rate: input.commissionRate,
    is_verified: input.isActive ?? true,
  }).select(ORG_SELECT).single();
  if (error) throw new Error(humanizeError(error.message));
  return mapOrg(kind, data);
}

export async function updatePartnerOrg(
  kind: PartnerKind, id: string, patch: Partial<PartnerOrgInput>,
): Promise<void> {
  const row: { name?: string; location?: string; commission_rate?: number; is_verified?: boolean } = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.location !== undefined) row.location = patch.location.trim();
  if (patch.commissionRate !== undefined) row.commission_rate = patch.commissionRate;
  if (patch.isActive !== undefined) row.is_verified = patch.isActive;
  if (Object.keys(row).length === 0) return;
  const { data, error } = await supabase.from(TABLE[kind]).update(row).eq('id', id).select('id');
  if (error) throw new Error(humanizeError(error.message));
  // A write RLS refuses comes back as zero rows, not as an error.
  if (!data || data.length === 0) throw new Error('You do not have permission to do that with this account.');
}

export function setPartnerOrgActive(kind: PartnerKind, id: string, active: boolean): Promise<void> {
  return updatePartnerOrg(kind, id, { isActive: active });
}

/** Every hotel and agency account, with the organisation it is linked to. */
export async function listPartnerUsers(): Promise<PartnerUser[]> {
  const { data, error } = await supabase.from('profiles')
    .select('id, role, full_name, business_name, verification_status, hotel_id, agency_id')
    .in('role', ['hotel', 'agency'])
    .order('full_name');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => {
    const kind = r.role as PartnerKind;
    return {
      id: r.id, kind, fullName: r.full_name, businessName: r.business_name,
      verificationStatus: r.verification_status as PartnerUser['verificationStatus'],
      orgId: kind === 'hotel' ? r.hotel_id : r.agency_id,
    };
  });
}

/** Links a hotel or agency account to an organisation of its own kind; null unlinks. */
export async function linkPartnerUser(userId: string, kind: PartnerKind, orgId: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_link_partner', {
    p_user_id: userId, p_kind: kind, p_org_id: orgId,
  });
  if (error) throw new Error(humanizeError(error.message));
}
