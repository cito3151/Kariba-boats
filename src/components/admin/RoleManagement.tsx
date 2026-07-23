import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Search } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
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
    <motion.div variants={staggerItem} className="rounded-xl border border-lake-100 bg-white p-3 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-lake-950">{user.email}</p>
          <p className="text-xs text-lake-500">{user.fullName || 'No name'}</p>
        </div>
        {user.isSuperAdmin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-lake-700 px-2.5 py-1 text-xs font-semibold text-white">
            <ShieldCheck size={12} /> Super admin
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-lake-500">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as ManagedUser['role'])}
            className="mt-1 block rounded-lg border border-lake-100 bg-lake-50 px-3 py-1.5 text-sm outline-none focus:border-lake-400">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <label className={`flex items-center gap-2 text-sm ${role === 'admin' ? 'text-lake-700' : 'text-lake-300'}`}>
          <input type="checkbox" checked={isSuper} disabled={role !== 'admin'}
            onChange={(e) => setIsSuper(e.target.checked)} className="h-4 w-4 rounded accent-lake-600" />
          Super admin
        </label>
        <button onClick={save} disabled={busy || !dirty}
          className="rounded-lg bg-lake-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          {busy ? 'Saving' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </motion.div>
  );
}

export default function RoleManagement() {
  const { data, loading, error, reload } = useAsync(usersSvc.listAllUsers, []);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const users = data ?? [];
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q) || (u.fullName ?? '').toLowerCase().includes(q));
  }, [data, query]);

  if (loading) return <LoadingState label="Loading users" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-lake-100 bg-lake-50 px-3 py-2">
        <Search size={14} className="text-lake-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name"
          className="w-full bg-transparent text-sm outline-none" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No users match" hint="Try a different email or name." />
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
          {filtered.map((u) => <UserRow key={u.id} user={u} onSaved={reload} />)}
        </motion.div>
      )}
    </div>
  );
}
