import { useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import * as usersSvc from '../../services/users.service';
import type { AppUserRow } from '../../services/users.service';

function Row({ user, onSaved }: { user: AppUserRow; onSaved: () => void }) {
  const [verified, setVerified] = useState(user.isVerified);
  const [trust, setTrust] = useState(user.trustScore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dirty = verified !== user.isVerified || trust !== user.trustScore;

  const save = async () => {
    setBusy(true); setError('');
    try { await usersSvc.setVerification(user.id, verified, trust); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-lake-100 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-lake-950">{user.businessName || user.fullName}</p>
          <p className="text-xs text-lake-500">
            {user.role} · {user.fullName}{user.phone ? ` · ${user.phone}` : ''}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          user.isVerified ? 'bg-lake-100 text-lake-700' : 'bg-amber-100 text-amber-800'
        }`}>
          {user.isVerified ? <><ShieldCheck size={12} /> Verified</> : <><ShieldAlert size={12} /> Unverified</>}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm text-lake-700">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)}
            className="h-4 w-4 rounded accent-lake-600" />
          Verified
        </label>
        <div>
          <label className="text-xs font-medium text-lake-500">Trust score (0 to 100)</label>
          <input type="number" min={0} max={100} value={trust}
            onChange={(e) => setTrust(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="mt-1 w-28 rounded-lg border border-lake-100 bg-lake-50 px-3 py-1.5 text-sm outline-none focus:border-lake-400" />
        </div>
        <button onClick={save} disabled={busy || !dirty}
          className="rounded-lg bg-lake-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          {busy ? 'Saving' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export default function UserVerification() {
  const { data, loading, error, reload } = useAsync(usersSvc.listOwnersAndHotels, []);

  if (loading) return <LoadingState label="Loading owners and hotels" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const users = data ?? [];

  return (
    <div className="space-y-3">
      {users.length === 0 && (
        <EmptyState title="No owners or hotels yet" hint="Verification appears here once owners or hotels sign up." />
      )}
      {users.map((u) => <Row key={u.id} user={u} onSaved={reload} />)}
    </div>
  );
}
