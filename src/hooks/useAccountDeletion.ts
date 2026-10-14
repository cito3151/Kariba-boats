import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../data/AuthContext';
import {
  cancelAccountDeletion, getAccountDeletionStatus, requestAccountDeletion,
  type AccountDeletionStatus,
} from '../services/account.service';

// One shared copy of the signed-in user's deletion status, so the reminder
// banner in the site header and the Account page always agree: cancelling on
// the page clears the banner at once, without a reload.

interface State {
  userId: string | null;
  status: AccountDeletionStatus | null;
  loading: boolean;
  /** The server does not have the deletion functions yet (migration 33 not applied). */
  unavailable: boolean;
  error: string;
}

let state: State = { userId: null, status: null, loading: false, unavailable: false, error: '' };
const listeners = new Set<() => void>();

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const isMissingFunction = (message: string) =>
  /could not find the function|schema cache|does not exist/i.test(message);

async function load(userId: string | null) {
  if (!userId) {
    setState({ userId: null, status: null, loading: false, unavailable: false, error: '' });
    return;
  }
  setState({ userId, loading: true, error: '' });
  try {
    const status = await getAccountDeletionStatus();
    if (state.userId === userId) setState({ status, loading: false, unavailable: false });
  } catch (err) {
    if (state.userId !== userId) return;
    const message = err instanceof Error ? err.message : 'Could not load your account status.';
    setState({ status: null, loading: false, unavailable: isMissingFunction(message), error: message });
  }
}

export function useAccountDeletion() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (state.userId !== userId) void load(userId);
  }, [userId]);

  const reload = useCallback(() => load(userId), [userId]);

  const request = useCallback(async () => {
    await requestAccountDeletion();
    await load(userId);
  }, [userId]);

  const cancel = useCallback(async () => {
    await cancelAccountDeletion();
    await load(userId);
  }, [userId]);

  const current = snapshot.userId === userId ? snapshot : { ...snapshot, status: null, loading: !!userId };
  return {
    status: current.status,
    loading: current.loading,
    unavailable: current.unavailable,
    error: current.error,
    pending: !!current.status?.requestedAt,
    reload, request, cancel,
  };
}

/** "Friday 13 November 2026", for deletion dates. */
export function formatLongDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
