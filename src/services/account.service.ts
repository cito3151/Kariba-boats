import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

// Account deletion (migration 33). A request starts a 30-day window in which the
// account is untouched and the request can be cancelled; after it, a daily server
// job deletes or anonymises the account's personal data.

export interface AccountDeletionStatus {
  /** When deletion was requested; null when none is pending. */
  requestedAt: string | null;
  /** When the account will be deleted (30 days after the request). */
  scheduledFor: string | null;
  /** Upcoming bookings still active (as guest or on the user's boats); these block a request. */
  activeBookings: number;
}

export async function getAccountDeletionStatus(): Promise<AccountDeletionStatus> {
  const { data, error } = await supabase.rpc('account_deletion_status');
  if (error) throw new Error(humanizeError(error.message));
  const row = (data ?? [])[0];
  return {
    requestedAt: row?.requested_at ?? null,
    scheduledFor: row?.scheduled_for ?? null,
    activeBookings: row?.active_bookings ?? 0,
  };
}

export async function requestAccountDeletion(): Promise<void> {
  const { error } = await supabase.rpc('request_account_deletion');
  if (error) throw new Error(humanizeError(error.message));
}

export async function cancelAccountDeletion(): Promise<void> {
  const { error } = await supabase.rpc('cancel_account_deletion');
  if (error) throw new Error(humanizeError(error.message));
}
