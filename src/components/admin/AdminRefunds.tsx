import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Gavel, Loader2 } from 'lucide-react';
import Reveal from '../Reveal';
import BookingRef from '../BookingRef';
import { RefundChip } from '../CancellationSummary';
import { Figure } from '../BookingFigures';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard, portalButtonPrimary, portalButtonSecondary } from '../portal/styles';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';
import type { BookingRow } from '../../services/bookings.service';
import {
  REASON_LABELS, REFUND_OUTCOME_LABELS, cancelledByText, karibaToday, longDate, money, refundNeedsAdmin,
} from '../../data/cancellation';
import type { RefundOutcome } from '../../data/cancellation';

const OUTCOMES: RefundOutcome[] = ['refund_confirmed', 'no_refund_owed', 'operator_did_not_pay'];

/**
 * The refunds queue (ADR-003 section 1.6): refunds reported as not received, and
 * refunds still unpaid after their due date, oldest first. Each can be resolved with
 * an outcome and a note, which everyone on the booking can read. Refunds not yet due
 * are listed underneath for reference. The platform never pays a refund; resolving
 * records what happened, and enforcement (suspending listings) is a separate step.
 */
export default function AdminRefunds({ onResolved }: { onResolved?: () => void }) {
  const { data, loading, error, reload } = useAsync(bookingsSvc.listOpenRefunds, []);
  const reduce = useReducedMotion();

  if (loading && !data) return <LoadingState large label="Loading refunds" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;

  const today = karibaToday();
  const all = data ?? [];
  const queue = all.filter((b) => refundNeedsAdmin(b, today))
    // Reports first, then by how long they have been overdue.
    .sort((a, b) => (a.refundStatus === b.refundStatus ? 0 : a.refundStatus === 'disputed' ? -1 : 1));
  const waiting = all.filter((b) => !refundNeedsAdmin(b, today));
  const done = () => { reload(); onResolved?.(); };

  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-[15px] leading-normal text-lake-800">
        Operators pay refunds directly to guests; Kariba Lake Connect never holds the money. These refunds were
        reported as not received, or are past their due date without being marked paid.
      </p>

      {queue.length === 0 && (
        <EmptyState large title="No refunds need attention" hint="Refunds reported as not received, or overdue, appear here." />
      )}
      <ul className="space-y-3">
        <AnimatePresence>
          {queue.map((b) => (
            <Reveal as="li" key={b.id} layout={!reduce} exit={{ opacity: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              className={`${portalCard} p-4 sm:p-5`}>
              <RefundCard booking={b} today={today} onResolved={done} />
            </Reveal>
          ))}
        </AnimatePresence>
      </ul>

      {waiting.length > 0 && (
        <section aria-labelledby="refunds-waiting">
          <h3 id="refunds-waiting" className="text-sm font-bold uppercase tracking-[0.05em] text-lake-800">
            Not yet due ({waiting.length})
          </h3>
          <ul className="mt-3 space-y-2">
            {waiting.map((b) => (
              <Reveal as="li" key={b.id} className={`${portalCard} flex flex-wrap items-center justify-between gap-2 px-4 py-3`}>
                <span className="min-w-0 break-words text-[15px] text-lake-900">
                  <span className="font-semibold">{b.boatName}</span> · {b.reference} · {money(b.refundDueAmount)} by {longDate(b.refundDueBy)}
                </span>
                <RefundChip status={b.refundStatus} />
              </Reveal>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RefundCard({ booking: b, today, onResolved }: { booking: BookingRow; today: string; onResolved: () => void }) {
  const uid = useId();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<RefundOutcome | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overdue = b.refundStatus === 'due' && b.refundDueBy !== null && today > b.refundDueBy;

  const resolve = async () => {
    if (busy) return;
    if (!outcome) { setError('Choose an outcome.'); return; }
    if (note.trim().length < 5) { setError('Add a note of at least 5 characters saying how this was resolved.'); return; }
    setBusy(true); setError('');
    try { await bookingsSvc.resolveRefund(b.id, outcome, note); onResolved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve this refund.'); setBusy(false); }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{b.boatName}</h3>
          <BookingRef reference={b.reference} className="mt-1.5" />
        </div>
        <RefundChip status={b.refundStatus} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-lake-100 pt-3 sm:grid-cols-4">
        <Figure label="Guest" valueClassName="text-base font-semibold text-lake-950">{b.guestName}</Figure>
        <Figure label="Refund owed" valueClassName="text-base font-semibold tabular-nums text-lake-950">{money(b.refundDueAmount)}</Figure>
        <Figure label="Due by" valueClassName={`text-base tabular-nums ${overdue ? 'font-semibold text-red-800' : 'text-lake-950'}`}>
          {longDate(b.refundDueBy)}{overdue ? ' (overdue)' : ''}
        </Figure>
        <Figure label="Cancelled">
          {longDate(b.cancelledAt)}, by {cancelledByText(b.cancelledByParty, 'admin', { isAgency: Boolean(b.agencyId) })}
        </Figure>
      </dl>
      <p className="mt-2 text-[15px] leading-normal text-lake-800">
        {b.cancelReason ? REASON_LABELS[b.cancelReason] : 'No reason recorded'}
        {b.cancelNote ? <>: <span className="break-words">“{b.cancelNote}”</span></> : ''}
      </p>
      {b.refundMarkedAt && (
        <p className="mt-1 text-[15px] leading-normal text-lake-800">
          Operator marked it refunded on {longDate(b.refundMarkedAt)}{b.refundNote ? <>: <span className="break-words">“{b.refundNote}”</span></> : '.'}
        </p>
      )}
      {b.refundReportedAt && (
        <p className="mt-1 text-[15px] leading-normal text-lake-800">Reported as not received on {longDate(b.refundReportedAt)}.</p>
      )}

      {!open ? (
        <div className="mt-3.5 border-t border-lake-100 pt-3.5">
          <button type="button" onClick={() => setOpen(true)} className={portalButtonSecondary}>
            <Gavel size={15} aria-hidden /> Resolve
          </button>
        </div>
      ) : (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, duration: 0.25 }}
          role="group" aria-labelledby={`${uid}-title`}
          className="mt-3.5 rounded-lg border border-lake-200 bg-lake-50 p-3.5">
          <p id={`${uid}-title`} className="text-base font-semibold text-lake-950">Resolve this refund</p>
          <fieldset className="mt-2">
            <legend className="text-sm font-semibold text-lake-800">Outcome</legend>
            <div className="mt-1.5 space-y-2">
              {OUTCOMES.map((o) => (
                <label key={o}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-lake-200 bg-white px-3 py-2 text-base text-lake-900 has-checked:border-lake-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lake-500">
                  <input type="radio" name={`${uid}-outcome`} checked={outcome === o} onChange={() => setOutcome(o)}
                    className="h-4 w-4 shrink-0 accent-lake-700 outline-none" />
                  {REFUND_OUTCOME_LABELS[o]}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor={`${uid}-note`} className="mt-3 block text-sm font-semibold text-lake-800">Note</label>
          <textarea id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
            aria-describedby={`${uid}-hint`}
            className="mt-1.5 block w-full min-w-0 resize-y rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-600" />
          <p id={`${uid}-hint`} className="mt-1 text-sm text-lake-700">
            The guest, the operator and any hotel or agency on the booking can read this. {note.length} of 500.
          </p>
          {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={resolve} aria-disabled={busy}
              className={`${portalButtonPrimary} ${busy ? 'cursor-not-allowed opacity-70' : ''}`}>
              {busy && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {busy ? 'Saving' : 'Resolve refund'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(''); }} aria-disabled={busy} className={portalButtonSecondary}>
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </>
  );
}
