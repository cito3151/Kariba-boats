import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Clock, X, ExternalLink } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard, portalButtonSecondary, portalButtonDanger } from '../portal/styles';
import { adminButtonApprove, adminButtonCommit, adminButtonConfirmReject } from './styles';
import { staggerContainer, staggerItem } from '../motion';
import { useAsync } from '../../hooks/useAsync';
import * as usersSvc from '../../services/users.service';
import type { AppUserRow, VerificationStatus } from '../../services/users.service';
import { listUserDocuments } from '../../services/documents.service';
import { openDocument } from '../../services/documentStorage.service';

// Sub-heading inside the section: the small uppercase label portal cards use, so
// it reads as part of "Owner and hotel verification" rather than a rival title.
const groupHeading = 'mb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-lake-700';

const inputClass =
  'min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

const STATUS_CHIP: Record<VerificationStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  verified: { label: 'Verified', className: 'bg-lake-100 text-lake-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
};

function AccountRow({ user, onDone }: { user: AppUserRow; onDone: () => void }) {
  const [mode, setMode] = useState<'none' | 'reject' | 'hotel' | 'agency'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [trust, setTrust] = useState(user.trustScore);
  const [reason, setReason] = useState('');
  const [hotelName, setHotelName] = useState(user.businessName ?? '');
  const [location, setLocation] = useState('');
  const [commission, setCommission] = useState(8);
  const { data: docsData } = useAsync(() => listUserDocuments(user.id), [user.id]);
  const docs = docsData ?? [];
  const hasDocs = docs.length > 0;
  // Routed through the shared helper: opening the tab has to happen synchronously
  // on the click, or Safari/Firefox block the popup without telling anyone, and the
  // helper surfaces that as a thrown error instead of a silently discarded null.
  const viewDoc = async (path: string) => {
    setError('');
    try { await openDocument(path); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the document.'); }
  };

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
  const submitAgency = () => {
    if (hotelName.trim().length < 2 || location.trim().length < 2) { setError('Enter an agency name and location.'); return; }
    run(() => usersSvc.verifyAgency(user.id, { agencyName: hotelName.trim(), location: location.trim(), commission, trustScore: trust }));
  };

  const chip = STATUS_CHIP[user.verificationStatus];

  return (
    <motion.div variants={staggerItem} className={`${portalCard} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{user.businessName || user.fullName}</p>
          <p className="mt-0.5 break-words text-[15px] leading-normal text-lake-700">{user.role} · {user.fullName}{user.phone ? ` · ${user.phone}` : ''}</p>
          {user.verificationStatus === 'rejected' && user.verificationNote && (
            <p className="mt-1 break-words text-[15px] leading-normal text-red-700">Reason: {user.verificationNote}</p>
          )}
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${chip.className}`}>
          {user.verificationStatus === 'pending' ? <Clock size={13} /> : user.verificationStatus === 'verified' ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
          {chip.label}
        </span>
      </div>

      <div className="mt-3 border-t border-lake-100 pt-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">
          Registration documents (<span className="tabular-nums">{docs.length}</span>)
        </p>
        {docs.length === 0 ? (
          <p className="mt-1 text-[15px] leading-normal text-amber-800">None uploaded yet. This account cannot be verified until it uploads at least one document.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {docs.map((d) => (
              <li key={d.id}>
                <button onClick={() => viewDoc(d.storagePath)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-sm py-1 text-left text-[15px] font-semibold text-lake-700 underline-offset-2 outline-none hover:text-lake-900 hover:underline focus-visible:ring-2 focus-visible:ring-lake-500">
                  <ExternalLink size={14} className="shrink-0" /> <span className="min-w-0 break-words">{d.label || d.fileName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}

      {mode === 'none' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {user.verificationStatus !== 'verified' && (
            <>
              <div>
                <label className="block text-sm font-medium text-lake-700">Trust score (0 to 100)</label>
                <input type="number" min={0} max={100} value={trust}
                  onChange={(e) => setTrust(Math.max(0, Math.min(100, Number(e.target.value))))}
                  aria-label="Trust score (0 to 100)"
                  className="mt-1.5 w-24 rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base tabular-nums text-lake-950 outline-none focus:border-lake-500" />
              </div>
              {user.role === 'hotel' ? (
                <button onClick={() => { setMode('hotel'); setError(''); }} disabled={busy || !hasDocs}
                  className={adminButtonCommit}>
                  Verify hotel
                </button>
              ) : user.role === 'agency' ? (
                <button onClick={() => { setMode('agency'); setError(''); }} disabled={busy || !hasDocs}
                  className={adminButtonCommit}>
                  Verify agency
                </button>
              ) : (
                <button onClick={verifyOwner} disabled={busy || !hasDocs} className={adminButtonApprove}>
                  Verify
                </button>
              )}
              <button onClick={() => { setMode('reject'); setError(''); }} disabled={busy} className={portalButtonDanger}>
                Reject
              </button>
              {/* A title on a disabled button reaches nobody: it is out of the tab
                  order and does not reliably fire a tooltip. */}
              {!hasDocs && (
                <p className="w-full text-[15px] leading-normal text-lake-700">Upload a registration document before this account can be verified.</p>
              )}
            </>
          )}
          {user.verificationStatus === 'verified' && (
            <button onClick={revoke} disabled={busy} className={portalButtonSecondary}>
              <X size={15} /> Revoke verification
            </button>
          )}
        </div>
      )}

      {mode === 'reject' && (
        <div className="mt-3 space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Reason for rejection (at least 5 characters)"
            aria-label="Reason for rejection"
            className="w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500" />
          <div className="flex flex-wrap gap-2">
            <button onClick={submitReject} disabled={busy} className={adminButtonConfirmReject}>Confirm rejection</button>
            <button onClick={() => { setMode('none'); setError(''); }} className={portalButtonSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'hotel' && (
        <div className="mt-3 space-y-2 rounded-lg bg-lake-50 p-3 sm:p-4">
          <p className="text-base font-bold text-lake-950">Verify and link this hotel</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="Hotel name"
              aria-label="Hotel name" className={inputClass} />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location"
              aria-label="Location" className={inputClass} />
            <input type="number" min={0} max={30} value={commission} onChange={(e) => setCommission(Number(e.target.value))}
              placeholder="Commission %" title="Commission %" aria-label="Commission %"
              className={`${inputClass} tabular-nums`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={submitHotel} disabled={busy} className={adminButtonCommit}>Verify and link</button>
            <button onClick={() => { setMode('none'); setError(''); }} className={portalButtonSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'agency' && (
        <div className="mt-3 space-y-2 rounded-lg bg-lake-50 p-3 sm:p-4">
          <p className="text-base font-bold text-lake-950">Verify and link this travel agency</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="Agency name"
              aria-label="Agency name" className={inputClass} />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location"
              aria-label="Location" className={inputClass} />
            <input type="number" min={0} max={30} value={commission} onChange={(e) => setCommission(Number(e.target.value))}
              placeholder="Commission %" title="Commission %" aria-label="Commission %"
              className={`${inputClass} tabular-nums`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={submitAgency} disabled={busy} className={adminButtonCommit}>Verify and link</button>
            <button onClick={() => { setMode('none'); setError(''); }} className={portalButtonSecondary}>Cancel</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function UserVerification() {
  const { data, loading, error, reload } = useAsync(usersSvc.listOwnersAndHotels, []);
  const reduce = useReducedMotion();

  if (loading) return <LoadingState large label="Loading owners and hotels" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;
  const users = data ?? [];
  const pending = users.filter((u) => u.verificationStatus === 'pending');
  const others = users.filter((u) => u.verificationStatus !== 'pending');

  return (
    <div className="space-y-8">
      <section>
        <h3 className={groupHeading}>Pending review (<span className="tabular-nums">{pending.length}</span>)</h3>
        {pending.length === 0 ? (
          <EmptyState large title="Nothing pending" hint="New owner and hotel signups appear here for review." />
        ) : (
          <motion.div variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show" className="space-y-3">
            {pending.map((u) => <AccountRow key={u.id} user={u} onDone={reload} />)}
          </motion.div>
        )}
      </section>
      {others.length > 0 && (
        <section>
          <h3 className={groupHeading}>Reviewed accounts</h3>
          <motion.div variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show" className="space-y-3">
            {others.map((u) => <AccountRow key={u.id} user={u} onDone={reload} />)}
          </motion.div>
        </section>
      )}
    </div>
  );
}
