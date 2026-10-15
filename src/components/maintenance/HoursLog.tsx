import { useId, useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { portalButtonDanger, portalButtonSecondary } from '../portal/styles';
import * as maint from '../../services/maintenance.service';
import type { HoursEntry } from '../../services/maintenance.service';

type VoidResult = Awaited<ReturnType<typeof maint.voidOperatingHours>>;

const loggedAtFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

function formatLoggedAt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : loggedAtFormat.format(d);
}

/**
 * The operating-hours log of one boat, newest first, shared by the owner's
 * maintenance page and the admin's maintenance attention list. A voided entry
 * stays in the list, struck through, with the reason it was corrected. Rows the
 * viewer may void carry a small action that opens a reason field and a confirm
 * button; the server (void_operating_hours) makes the final decision.
 */
export default function HoursLog({
  entries, canVoid, actionLabel, onVoided,
}: {
  entries: HoursEntry[];
  /** Whether this viewer may void this entry (the owner rule, or always for an admin). */
  canVoid: (entry: HoursEntry) => boolean;
  /** "Correct this entry" for an owner, "Void entry" for an admin. */
  actionLabel: string;
  /** Called after a successful void, to reload the log and the boat's figures. */
  onVoided: (result: VoidResult) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (entries.length === 0) {
    return <p className="mt-1.5 text-base text-lake-700">No hours logged yet.</p>;
  }

  return (
    <ul className="mt-2 divide-y divide-lake-100">
      {entries.map((h) => (
        <HoursRow key={h.id} entry={h}
          voidable={!h.voidedAt && canVoid(h)}
          actionLabel={actionLabel}
          open={openId === h.id}
          onOpen={() => setOpenId(h.id)}
          onClose={() => setOpenId(null)}
          onVoided={(result) => { setOpenId(null); onVoided(result); }} />
      ))}
    </ul>
  );
}

function HoursRow({
  entry: h, voidable, actionLabel, open, onOpen, onClose, onVoided,
}: {
  entry: HoursEntry; voidable: boolean; actionLabel: string; open: boolean;
  onOpen: () => void; onClose: () => void; onVoided: (result: VoidResult) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const fieldId = useId();
  const hintId = useId();
  const voided = !!h.voidedAt;
  const hoursText = h.hours.toFixed(1);

  const close = () => {
    setReason(''); setError('');
    onClose();
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const confirm = async () => {
    if (reason.trim().length < 5) { setError('Say what was wrong with this entry (at least 5 characters).'); return; }
    setBusy(true); setError('');
    try {
      const result = await maint.voidOperatingHours(h.id, reason.trim());
      setReason('');
      onVoided(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not correct this entry.');
    } finally { setBusy(false); }
  };

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-base">
        <span className={`min-w-0 break-words ${voided ? 'text-lake-700 line-through decoration-lake-700' : 'text-lake-800'}`}>
          <span className="font-semibold tabular-nums">+{hoursText} h</span>
          {h.note ? <span className="text-lake-700">, {h.note}</span> : ''}
        </span>
        <span className={`tabular-nums text-lake-700 ${voided ? 'line-through' : ''}`}>total {h.readingAfter.toFixed(1)}</span>
      </div>
      <p className="mt-0.5 text-sm text-lake-700">
        <span className="sr-only">Logged </span>{formatLoggedAt(h.loggedAt)}
        {voided && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-semibold text-amber-900">Corrected</span>}
      </p>
      {voided && h.voidReason && (
        <p className="mt-1 break-words text-[15px] leading-normal text-lake-800">
          <span className="font-semibold">Reason:</span> {h.voidReason}
        </p>
      )}

      {voidable && !open && (
        <button ref={trigger} type="button" onClick={onOpen}
          className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-sm text-sm font-semibold text-lake-700 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
          <Undo2 size={15} aria-hidden /> {actionLabel}
          <span className="sr-only">: {hoursText} hours, {formatLoggedAt(h.loggedAt)}</span>
        </button>
      )}

      {voidable && open && (
        <div className="mt-2 space-y-2.5 rounded-lg border border-lake-100 bg-lake-50/60 p-3.5">
          <div>
            <label htmlFor={fieldId} className="block text-sm font-medium text-lake-700">
              What was wrong with this entry?
            </label>
            <textarea id={fieldId} value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              autoFocus maxLength={500} aria-describedby={hintId}
              placeholder="Typed 24 instead of 2.4"
              className="mt-1 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500" />
            <p id={hintId} className="mt-1 text-sm leading-normal text-lake-700">
              This takes {hoursText} hours off the boat's total. The entry stays in the log, struck through, with your reason.
            </p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={confirm} disabled={busy} className={portalButtonDanger}>
              {busy ? 'Correcting' : `Remove ${hoursText} hours`}
            </button>
            <button type="button" onClick={close} disabled={busy} className={portalButtonSecondary}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}
