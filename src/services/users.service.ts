import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface AppUserRow {
  id: string; fullName: string; role: 'tourist' | 'owner' | 'hotel' | 'admin';
  businessName: string | null; phone: string | null;
  verificationStatus: VerificationStatus; verificationNote: string | null;
  trustScore: number; hotelId: string | null;
}

export async function listOwnersAndHotels(): Promise<AppUserRow[]> {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, role, business_name, phone, verification_status, verification_note, trust_score, hotel_id, created_at')
    .in('role', ['owner', 'hotel']).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => ({
    id: r.id, fullName: r.full_name, role: r.role, businessName: r.business_name, phone: r.phone,
    verificationStatus: r.verification_status as VerificationStatus, verificationNote: r.verification_note,
    trustScore: r.trust_score, hotelId: r.hotel_id,
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

export async function verifyHotel(
  userId: string, input: { hotelName: string; location: string; commission?: number; trustScore?: number },
) {
  const { error } = await supabase.rpc('admin_verify_hotel', {
    p_user_id: userId, p_hotel_name: input.hotelName, p_location: input.location,
    p_commission: input.commission ?? undefined, p_trust_score: input.trustScore ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}
