import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export type Role = 'tourist' | 'owner' | 'hotel' | 'admin' | 'agency';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface AppUser {
  id: string; email: string; name: string; role: Role;
  phone: string | null; businessName: string | null;
  hotelId: string | null; agencyId: string | null;
  verificationStatus: VerificationStatus; verificationNote: string | null;
  isVerified: boolean; isSuperAdmin: boolean;
}

export interface SignupInput {
  email: string; password: string; fullName: string; role: Role;
  phone?: string; businessName?: string;
}

export async function signUp(input: SignupInput) {
  // role travels in user metadata; the database trigger whitelists it and
  // silently downgrades anything outside tourist/owner/hotel.
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        role: input.role,
        phone: input.phone ?? null,
        business_name: input.businessName ?? null,
      },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  });
  if (error) throw new Error(error.message);
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error('Please confirm your email address first. Check your inbox for the link.');
    }
    throw new Error('Incorrect email or password.');
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function requestPasswordReset(email: string) {
  await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  // Deliberately not surfacing whether the account exists.
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function fetchProfile(userId: string, email: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, business_name, hotel_id, agency_id, verification_status, verification_note, is_super_admin')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id, email, name: data.full_name, role: data.role as Role,
    phone: data.phone, businessName: data.business_name, hotelId: data.hotel_id, agencyId: data.agency_id,
    verificationStatus: data.verification_status as VerificationStatus,
    verificationNote: data.verification_note,
    isVerified: data.verification_status === 'verified',
    isSuperAdmin: data.is_super_admin,
  };
}

export interface ProfileEdit {
  fullName: string;
  phone: string;
  /** Left out (undefined) to keep the stored value, e.g. a tourist or a verified business. */
  businessName?: string;
}

/**
 * Saves the signed-in user's own name, phone and business name. The column grant
 * allows only these three columns, profiles_update_own_or_admin limits the row to
 * the caller's own, and guard_profile_privileges refuses a business-name change
 * on a verified owner, hotel or agency (migration 37).
 */
export async function updateMyProfile(input: ProfileEdit): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) throw new Error('Your session has expired. Please log in again.');
  const row: { full_name: string; phone: string | null; business_name?: string | null } = {
    full_name: input.fullName.trim(),
    phone: input.phone.trim() || null,
  };
  if (input.businessName !== undefined) row.business_name = input.businessName.trim() || null;
  const { error } = await supabase.from('profiles').update(row).eq('id', userId);
  if (error) throw new Error(humanizeError(error.message));
}
