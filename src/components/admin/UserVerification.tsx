import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Clock, X } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import * as usersSvc from '../../services/users.service';
import type { AppUserRow, VerificationStatus } from '../../services/users.service';

const STATUS_CHIP: Record<VerificationStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  verified: { label: 'Verified', className: 'bg-lake-100 text-lake-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
};

function AccountRow({ user, onDone }: { user: AppUserRow; onDone: () => void }) {
  const [mode, setMode] = useState<'none' | 'reject' | 'hotel'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [trust, setTrust] = useState(user.trustScore);
  const [reason, setReason] = useState('');
  const [hotelName, setHotelName] = useState(user.businessName ?? '');
  const [location, setLocation] = useState('');
  const [commission, setCommission] = useState(8);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); setMode('none'); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const verifyOwner = () => run(() => usersSvc.reviewAccount(user.id, 'verified', trust));
  const revoke = () => run(() => usersSvc.reviewAccount(user.id, 'pending'));
  const submitReject = () => {
    if (reason.trim().length < 5) { setError('A rejection reason needs at least 5 characters.'); return; }
    run(() => usersSvc.reviewAccount(user.id, 'rejected', undefined, reason.trim()));
  };
  const submitHotel = () => {
    if (hotelName.trim().length < 2 || location.trim().length < 2) { setError('Enter a hotel name and location.'); return; }
    run(() => usersSvc.verifyHotel(user.id, { hotelName: hotelName.trim(), location: location.trim(), commission, trustScore: trust }));
  };

  const chip = STATUS_CHIP[user.verificationStatus];

  return (
    <div className="rounded-xl border border-lake-100 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-lake-950">{user.businessName || user.fullName}</p>
          <p className="text-xs text-lake-500">{user.role} · {user.fullName}{user.phone ? ` · ${user.phone}` : ''}</p>
          {user.verificationStatus === 'rejected' && user.verificationNote && (
            <p className="mt-1 text-xs text-red-600">Reason: {user.verificationNote}</p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.className}`}>
          {user.verificationStatus === 'pending' ? <Clock size={12} /> : user.verificationStatus === 'verified' ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
          {chip.label}
        </span>
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {mode === 'none' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {user.verificationStatus !== 'verified' && (
            <>
              <div>
                <label className="text-xs font-medium text-lake-500">Trust score (0 to 100)</label>
                <input type="number" min={0} max={100} value={trust}
                  onChange={(e) => setTrust(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="mt-1 w-24 rounded-lg border border-lake-100 bg-lake-50 px-3 py-1.5 text-sm outline-none focus:border-lake-400" />
              </div>
              {user.role === 'hotel' ? (
                <button onClick={() => { setMode('hotel'); setError(''); }} disabled={busy}
                  className="rounded-lg bg-lake-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
                  Verify hotel
                </button>
              ) : (
                <button onClick={verifyOwner} disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  Verify
                </button>
              )}
              <button onClick={() => { setMode('reject'); setError(''); }} disabled={busy}
                className="rounded-lg border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                Reject
              </button>
            </>
          )}
          {user.verificationStatus === 'verified' && (
            <button onClick={revoke} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-lake-200 px-4 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-50 disabled:opacity-50">
              <X size={13} /> Revoke verification
            </button>
          )}
        </div>
      )}

      {mode === 'reject' && (
        <div className="mt-3 space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Reason for rejection (at least 5 characters)"
            className="w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400" />
          <div className="flex gap-2">
            <button onClick={submitReject} disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm rejection</button>
            <button onClick={() => { setMode('none'); setError(''); }}
              className="rounded-lg border border-lake-200 px-4 py-1.5 text-xs font-medium text-lake-600 hover:bg-lake-50">Cancel</button>
          </div>
        </div>
      )}

      {mode === 'hotel' && (
        <div className="mt-3 space-y-2 rounded-lg border border-lake-100 bg-lake-50/60 p-3">
          <p className="text-xs font-semibold text-lake-800">Verify and link this hotel</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="Hotel name"
              className="rounded-lg border border-lake-100 bg-white px-3 py-1.5 text-sm outline-none focus:border-lake-400" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location"
              className="rounded-lg border border-lake-100 bg-white px-3 py-1.5 text-sm outline-none focus:border-lake-400" />
            <input type="number" min={0} max={30} value={commission} onChange={(e) => setCommission(Number(e.target.value))}
              placeholder="Commission %" title="Commission %"
              className="rounded-lg border border-lake-100 bg-white px-3 py-1.5 text-sm outline-none focus:border-lake-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={submitHotel} disabled={busy}
              className="rounded-lg bg-lake-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">Verify and link</button>
            <button onClick={() => { setMode('none'); setError(''); }}
              className="rounded-lg border border-lake-200 px-4 py-1.5 text-xs font-medium text-lake-600 hover:bg-lake-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserVerification() {
  const { data, loading, error, reload } = useAsync(usersSvc.listOwnersAndHotels, []);

  if (loading) return <LoadingState label="Loading owners and hotels" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const users = data ?? [];
  const pending = users.filter((u) => u.verificationStatus === 'pending');
  const others = users.filter((u) => u.verificationStatus !== 'pending');

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-lake-800">Pending review ({pending.length})</h3>
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending" hint="New owner and hotel signups appear here for review." />
        ) : (
          <div className="space-y-3">{pending.map((u) => <AccountRow key={u.id} user={u} onDone={reload} />)}</div>
        )}
      </section>
      {others.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-lake-800">Reviewed accounts</h3>
          <div className="space-y-3">{others.map((u) => <AccountRow key={u.id} user={u} onDone={reload} />)}</div>
        </section>
      )}
    </div>
  );
}
