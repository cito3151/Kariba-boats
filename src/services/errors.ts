// Turns low-level Supabase/Postgres errors into language a user should see.
// Our own RPC and domain messages (for example "A completed trip cannot be
// cancelled") are already friendly, so those pass through unchanged; only the
// raw infrastructure errors get rewritten.
export function humanizeError(message: string | undefined, fallback = 'Something went wrong. Please try again.'): string {
  if (!message) return fallback;
  const m = message.toLowerCase();

  if (m.includes('consent required')) {
    return 'Please review and accept our latest terms to continue.';
  }
  if (m.includes('row-level security') || m.includes('permission denied') || m.includes('not allowed')) {
    return 'You do not have permission to do that with this account.';
  }
  if (m.includes('jwt') || m.includes('token is expired') || m.includes('not authenticated') || m.includes('session')) {
    return 'Your session has expired. Please log in again.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('fetch failed')) {
    return 'Network problem. Check your connection and try again.';
  }
  return message;
}
