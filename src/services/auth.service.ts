import { supabase } from '../lib/supabase';

export type Role = 'tourist' | 'owner' | 'hotel' | 'admin';

export interface AppUser {
  id: string; email: string; name: string; role: Role;
  phone: string | null; businessName: string | null;
  hotelId: string | null; isVerified: boolean;
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
    .select('id, role, full_name, phone, business_name, hotel_id, is_verified')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id, email, name: data.full_name, role: data.role as Role,
    phone: data.phone, businessName: data.business_name,
    hotelId: data.hotel_id, isVerified: data.is_verified,
  };
}
