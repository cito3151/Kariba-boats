import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, Search, CalendarClock } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard, portalButtonDanger, portalButtonSecondary } from '../portal/styles';
import { adminButtonCommit, adminButtonConfirmReject } from './styles';
import { staggerContainer, staggerItem } from '../motion';
import { useAuth } from '../../data/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { formatLongDate } from '../../hooks/useAccountDeletion';
import * as usersSvc from '../../services/users.service';
import type { ManagedUser } from '../../services/users.service';

const ROLES: ManagedUser['role'][] = ['tourist', 'owner', 'hotel', 'agency', 'admin'];

/**
 * Closing another user's account: the same 30-day deletion the user can ask for
 * on their own Account page (admin_schedule_account_deletion, migration 38). An
 * administrator account is demoted first, with the role control above, so losing
 * admin access and queueing the account are two deliberate, separately audited
 * steps. Nothing is offered on your own row.
 */
function AccountClosure({ user, onChanged }: { user: ManagedUser; onChanged: () => void }) {
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const startButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const isAdmin = user.role === 'admin' || user.isSuperAdmin;

  useEffect(() => {
    if (step === 'confirm') confirmButton.current?.focus();
  }, [step]);

  const close = () => {
    setStep('idle'); setError('');
    requestAnimationFrame(() => startButton.current?.focus());
  };

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true); setError('');
    try { await fn(); setStep('idle'); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : fallback); }
    finally { setBusy(false); }
  };

  let body;
  if (user.purgedAt) {
    body = <p className="text-[15px] leading-normal text-lake-700">This account has been deleted.</p>;
  } else if (user.deletionScheduledFor) {
    body = (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex min-w-0 items-start gap-2 text-[15px] leading-normal text-lake-900">
          <CalendarClock size={17} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <span>Due to be deleted on <strong className="font-semibold">{formatLongDate(user.deletionScheduledFor)}</strong>. The user can cancel it from their Account page until then.</span>
        </p>
        <button type="button" onClick={() => run(() => usersSvc.cancelScheduledDeletion(user.id), 'Could not stop the deletion.')}
          disabled={busy} className={portalButtonSecondary}>
          {busy ? 'Stopping' : 'Stop deletion'}
        </button>
      </div>
    );
  } else if (isAdmin) {
    body = (
      <p className="text-[15px] leading-normal text-lake-700">
        To close this account, first change its role to a non-administrator role and save. Then you can schedule its deletion here.
      </p>
    );
  } else if (step === 'confirm') {
    body = (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3.5">
        <p className="text-base leading-relaxed text-lake-950">
          Delete <strong className="font-bold [overflow-wrap:anywhere]">{user.email}</strong> in 30 days?
        </p>
        <p className="mt-1 text-[15px] leading-normal text-lake-900">
          Nothing is removed for 30 days, and the user can cancel from their Account page in that time. After that their
          personal details are deleted and the sign-in is closed; booking records the law requires are kept without their
          name. An account with upcoming bookings cannot be scheduled until they are cancelled or completed.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button ref={confirmButton} type="button" disabled={busy}
            onClick={() => run(() => usersSvc.scheduleAccountDeletion(user.id), 'Could not schedule the deletion.')}
            className={adminButtonConfirmReject}>
            {busy ? 'Scheduling' : 'Schedule deletion'}
          </button>
          <button type="button" onClick={close} disabled={busy} className={portalButtonSecondary}>Cancel</button>
        </div>
      </div>
    );
  } else {
    body = (
      <button ref={startButton} type="button" onClick={() => { setError(''); setStep('confirm'); }} className={portalButtonDanger}>
        Close account
      </button>
    );
  }

  return (
    <div className="mt-4 border-t border-lake-100 pt-3.5">
      {body}
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}
    </div>
  );
}

function UserRow({ user, isSelf, onSaved }: { user: ManagedUser; isSelf: boolean; onSaved: () => void }) {
  const [role, setRole] = useState<ManagedUser['role']>(user.role);
  const [isSuper, setIsSuper] = useState(user.isSuperAdmin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dirty = role !== user.role || isSuper !== user.isSuperAdmin;

  const save = async () => {
    setBusy(true); setError('');
    try { await usersSvc.setUserRole(user.id, role, role === 'admin' ? isSuper : false); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update this user.'); }
    finally { setBusy(false); }
  };

  return (
    <motion.div variants={staggerItem} className={`${portalCard} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Wraps anywhere: an address has no spaces to break at, and truncating
              it would hide the part that tells two accounts apart. */}
          <p className="text-base font-semibold text-lake-950 [overflow-wrap:anywhere]">{user.email}</p>
          <p className="mt-0.5 text-[15px] text-lake-700">{user.fullName || 'No name'}</p>
        </div>
        {user.isSuperAdmin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-lake-700 px-2.5 py-1 text-[13px] font-semibold leading-none text-white">
            <ShieldCheck size={13} /> Super admin
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-sm font-medium text-lake-700">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as ManagedUser['role'])}
            className="mt-1 block rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base outline-none focus:border-lake-500">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <label className={`flex items-center gap-2 text-base ${role === 'admin' ? 'text-lake-800' : 'text-lake-600'}`}>
          <input type="checkbox" checked={isSuper} disabled={role !== 'admin'}
            onChange={(e) => setIsSuper(e.target.checked)} className="h-5 w-5 rounded accent-lake-700" />
          Super admin
        </label>
        <button onClick={save} disabled={busy || !dirty} className={adminButtonCommit}>
          {busy ? 'Saving' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}
      {!isSelf && <AccountClosure user={user} onChanged={onSaved} />}
    </motion.div>
  );
}

export default function RoleManagement() {
  const { currentUser } = useAuth();
  const { data, loading, error, reload } = useAsync(usersSvc.listAllUsers, []);
  const [query, setQuery] = useState('');
  const reduce = useReducedMotion();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const users = data ?? [];
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q) || (u.fullName ?? '').toLowerCase().includes(q));
  }, [data, query]);

  if (loading && !data) return <LoadingState large label="Loading users" />;
  if (error && !data) return <ErrorState large message={error} onRetry={reload} />;

  return (
    <div className="space-y-3">
      {/* White, not lake-50: the search sits on the lake-50 page, not in a card. */}
      <div className="flex items-center gap-2 rounded-lg border border-lake-200 bg-white px-3 py-2.5 focus-within:border-lake-500 sm:max-w-md">
        <Search size={16} className="shrink-0 text-lake-600" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name" aria-label="Search users by email or name"
          className="w-full bg-transparent text-base text-lake-950 outline-none" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState large title="No users match" hint="Try a different email or name." />
      ) : (
        <motion.div variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show" className="space-y-3">
          {filtered.map((u) => <UserRow key={u.id} user={u} isSelf={u.id === currentUser?.id} onSaved={reload} />)}
        </motion.div>
      )}
    </div>
  );
}
