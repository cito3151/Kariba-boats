import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface AppUserRow {
  id: string; fullName: string; role: 'tourist' | 'owner' | 'hotel' | 'admin';
  businessName: string | null; phone: string | null; isVerified: boolean; trustScore: number;
}

export async function listOwnersAndHotels(): Promise<AppUserRow[]> {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, role, business_name, phone, is_verified, trust_score, created_at')
    .in('role', ['owner', 'hotel']).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => ({
    id: r.id, fullName: r.full_name, role: r.role, businessName: r.business_name,
    phone: r.phone, isVerified: r.is_verified, trustScore: r.trust_score,
  }));
}

export async function setVerification(userId: string, verified: boolean, trustScore: number) {
  const { error } = await supabase.rpc('admin_set_verification', {
    p_user_id: userId, p_verified: verified, p_trust_score: trustScore,
  });
  if (error) throw new Error(humanizeError(error.message));
}
