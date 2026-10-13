import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, Search } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard } from '../portal/styles';
import { adminButtonCommit } from './styles';
import { staggerContainer, staggerItem } from '../motion';
import { useAsync } from '../../hooks/useAsync';
import * as usersSvc from '../../services/users.service';
import type { ManagedUser } from '../../services/users.service';

const ROLES: ManagedUser['role'][] = ['tourist', 'owner', 'hotel', 'agency', 'admin'];

function UserRow({ user, onSaved }: { user: ManagedUser; onSaved: () => void }) {
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
    </motion.div>
  );
}

export default function RoleManagement() {
  const { data, loading, error, reload } = useAsync(usersSvc.listAllUsers, []);
  const [query, setQuery] = useState('');
  const reduce = useReducedMotion();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const users = data ?? [];
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q) || (u.fullName ?? '').toLowerCase().includes(q));
  }, [data, query]);

  if (loading) return <LoadingState large label="Loading users" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;

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
          {filtered.map((u) => <UserRow key={u.id} user={u} onSaved={reload} />)}
        </motion.div>
      )}
    </div>
  );
}
