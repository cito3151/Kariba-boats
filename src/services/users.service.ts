import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface AppUserRow {
  id: string; fullName: string; role: 'tourist' | 'owner' | 'hotel' | 'admin' | 'agency';
  businessName: string | null; phone: string | null;
  verificationStatus: VerificationStatus; verificationNote: string | null;
  trustScore: number; hotelId: string | null; agencyId: string | null;
}

export async function listOwnersAndHotels(): Promise<AppUserRow[]> {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, role, business_name, phone, verification_status, verification_note, trust_score, hotel_id, agency_id, created_at')
    .in('role', ['owner', 'hotel', 'agency']).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => ({
    id: r.id, fullName: r.full_name, role: r.role, businessName: r.business_name, phone: r.phone,
    verificationStatus: r.verification_status as VerificationStatus, verificationNote: r.verification_note,
    trustScore: r.trust_score, hotelId: r.hotel_id, agencyId: r.agency_id,
  }));
}

export async function reviewAccount(
  userId: string, status: VerificationStatus, trustScore?: number, note?: string,
) {
  const { error } = await supabase.rpc('admin_review_account', {
    p_user_id: userId, p_status: status,
    p_trust_score: trustScore ?? undefined, p_note: note ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export interface ManagedUser {
  id: string; email: string; fullName: string;
  role: 'tourist' | 'owner' | 'hotel' | 'admin' | 'agency';
  isSuperAdmin: boolean; verificationStatus: VerificationStatus;
}

/**
 * Verifies an agency account and links it. With `agencyId` it links that existing
 * agency; without one it reuses the agency the account is already linked to, or
 * creates one from the name, location and commission (migration 37).
 */
export async function verifyAgency(
  userId: string,
  input: { agencyId?: string; agencyName?: string; location?: string; commission?: number; trustScore?: number },
) {
  const { error } = await supabase.rpc('admin_verify_agency', {
    p_user_id: userId, p_agency_id: input.agencyId ?? undefined,
    p_agency_name: input.agencyName ?? undefined, p_location: input.location ?? undefined,
    p_commission: input.commission ?? undefined, p_trust_score: input.trustScore ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function listAllUsers(): Promise<ManagedUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw new Error(humanizeError(error.message));
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => ({
    id: r.id, email: r.email, fullName: r.full_name, role: r.role,
    isSuperAdmin: r.is_super_admin, verificationStatus: r.verification_status as VerificationStatus,
  }));
}

export async function setUserRole(userId: string, role: ManagedUser['role'], isSuperAdmin: boolean) {
  const { error } = await supabase.rpc('admin_set_role', {
    p_user_id: userId, p_role: role, p_is_super_admin: isSuperAdmin,
  });
  if (error) throw new Error(humanizeError(error.message));
}

/** Verifies a hotel account and links it; the hotel is chosen as in verifyAgency. */
export async function verifyHotel(
  userId: string,
  input: { hotelId?: string; hotelName?: string; location?: string; commission?: number; trustScore?: number },
) {
  const { error } = await supabase.rpc('admin_verify_hotel', {
    p_user_id: userId, p_hotel_id: input.hotelId ?? undefined,
    p_hotel_name: input.hotelName ?? undefined, p_location: input.location ?? undefined,
    p_commission: input.commission ?? undefined, p_trust_score: input.trustScore ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}
