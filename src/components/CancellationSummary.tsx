import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Flag, Loader2 } from 'lucide-react';
import { markRefunded, reportRefundNotReceived } from '../services/bookings.service';
import type { BookingRow } from '../services/bookings.service';
import {
  OFF_PLATFORM_NOTE, POLICY_INFO, REASON_LABELS, REFUND_OUTCOME_LABELS, REFUND_STATUS_LABELS,
  cancelledByText, karibaToday, longDate, money,
} from '../data/cancellation';
import type { RefundStatus, Viewer } from '../data/cancellation';
import { portalButtonSecondary } from './portal/styles';

/** Refund status chips. Every pair is 7:1 or better. */
const CHIP: Record<RefundStatus, string> = {
  none: 'bg-gray-100 text-gray-800',
  due: 'bg-amber-100 text-amber-900',
  refunded: 'bg-emerald-100 text-emerald-900',
  disputed: 'bg-red-100 text-red-900',
  resolved: 'bg-lake-100 text-lake-900',
};

export function RefundChip({ status }: { status: RefundStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${CHIP[status]}`}>
      {REFUND_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * The cancellation record on a cancelled booking's card: who cancelled and when,
 * why, the fee the operator keeps, the refund it owes and where that refund stands.
 * With the right viewer it carries the refund follow-up: the operator's "Mark
 * refunded" (manage_bookings), and the guest's or partner's "Report not received"
 * once the refund is marked paid or its due date has passed. A booking cancelled
 * before migration 42 has no record, and says so.
 */
export default function CancellationSummary({
  booking: b, viewer, partnerName, guestWord = 'guest', canMarkRefunded = false, onChanged,
}: {
  booking: BookingRow;
  viewer: Viewer;
  /** The hotel's or agency's own name, on its own portal. */
  partnerName?: string | null;
  guestWord?: 'guest' | 'client';
  /** The operator team member may mark refunds paid (manage_bookings). */
  canMarkRefunded?: boolean;
  /** Runs after a refund action, normally the list's reload. */
  onChanged?: () => void;
}) {
  if (b.status !== 'cancelled') return null;

  if (!b.cancelledAt) {
    return (
      <p className="mt-3 border-t border-lake-100 pt-3 text-[15px] leading-normal text-lake-700">
        Cancelled before cancellation records began, so no fee or refund was recorded here.
      </p>
    );
  }

  const who = cancelledByText(b.cancelledByParty, viewer, { partnerName, isAgency: Boolean(b.agencyId), guestWord });
  const refund = b.refundDueAmount ?? 0;
  const fee = b.cancellationFeeAmount ?? 0;
  const today = karibaToday();
  const pastDue = Boolean(b.refundDueBy && today > b.refundDueBy);
  const canReport = (viewer === 'guest' || viewer === 'partner')
    && (b.refundStatus === 'refunded' || (b.refundStatus === 'due' && pastDue));
  const canMark = viewer === 'operator' && canMarkRefunded && b.refundStatus === 'due';

  return (
    <div className="mt-3 border-t border-lake-100 pt-3">
      <p className="text-[15px] leading-normal text-lake-800">
        <span className="font-semibold text-lake-950">Cancelled by {who}</span>
        , <time dateTime={b.cancelledAt} className="tabular-nums">{longDate(b.cancelledAt)}</time>
        {b.cancelReason && <> · {REASON_LABELS[b.cancelReason]}</>}
      </p>
      {b.cancelNote && (
        <p className="mt-1 break-words text-[15px] leading-normal text-lake-700">“{b.cancelNote}”</p>
      )}

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-[repeat(3,minmax(0,auto))] sm:justify-start sm:gap-x-8">
        <div className="min-w-0">
          <dt className="text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">Fee kept</dt>
          <dd className="mt-0.5 text-base tabular-nums text-lake-950">{money(fee)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">Refund</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-lake-950">
            {refund > 0 ? money(refund) : 'None'}
            {refund > 0 && b.refundDueBy && <span className="font-normal text-lake-800"> by {longDate(b.refundDueBy)}</span>}
          </dd>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">Refund status</dt>
          <dd className="mt-1"><RefundChip status={b.refundStatus} /></dd>
        </div>
      </dl>

      {b.cancellationPolicy && (
        <p className="mt-2 text-sm leading-snug text-lake-700">
          Booked under the {POLICY_INFO[b.cancellationPolicy].label} policy.
        </p>
      )}

      {b.refundStatus === 'due' && (
        <p className="mt-2 text-sm leading-snug text-lake-800">
          {viewer === 'operator'
            ? `Pay ${money(refund)} back to the ${guestWord} by ${longDate(b.refundDueBy)}, the way the deposit was paid, then mark it refunded.`
            : pastDue
              ? `The refund was due by ${longDate(b.refundDueBy)}. If it has not arrived, report it.`
              : OFF_PLATFORM_NOTE}
        </p>
      )}
      {b.refundStatus === 'refunded' && b.refundMarkedAt && (
        <p className="mt-2 text-sm leading-snug text-lake-800">
          The operator marked it refunded on {longDate(b.refundMarkedAt)}
          {b.refundNote ? <>: <span className="break-words">“{b.refundNote}”</span></> : '.'}
        </p>
      )}
      {b.refundStatus === 'disputed' && (
        <p className="mt-2 text-sm leading-snug text-lake-800">
          Reported as not received{b.refundReportedAt ? ` on ${longDate(b.refundReportedAt)}` : ''}. Kariba Lake Connect is
          following it up with the operator.
        </p>
      )}
      {b.refundStatus === 'resolved' && (
        <p className="mt-2 text-sm leading-snug text-lake-800">
          {b.refundOutcome ? REFUND_OUTCOME_LABELS[b.refundOutcome] : 'Resolved'}
          {b.refundResolvedAt ? ` (${longDate(b.refundResolvedAt)})` : ''}
          {b.refundResolutionNote ? <>: <span className="break-words">“{b.refundResolutionNote}”</span></> : '.'}
        </p>
      )}

      {canMark && <MarkRefunded bookingId={b.id} amount={refund} guestWord={guestWord} onDone={onChanged} />}
      {canReport && <ReportNotReceived bookingId={b.id} onDone={onChanged} />}
    </div>
  );
}

function useInlinePanel() {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0.15 } : { type: 'spring' as const, bounce: 0, duration: 0.25 },
  };
}

/** The operator's "Mark refunded", with an optional note such as a payment reference. */
function MarkRefunded({ bookingId, amount, guestWord, onDone }: {
  bookingId: string; amount: number; guestWord: string; onDone?: () => void;
}) {
  const uid = useId();
  const panel = useInlinePanel();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await markRefunded(bookingId, note); setOpen(false); onDone?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not mark this refund.'); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <div className="mt-3">
        <button type="button" onClick={() => setOpen(true)} className={portalButtonSecondary}>
          <CheckCircle2 size={15} aria-hidden /> Mark refunded
        </button>
      </div>
    );
  }
  return (
    <motion.div {...panel} className="mt-3 max-w-md rounded-lg border border-lake-200 bg-lake-50 p-3.5"
      role="group" aria-labelledby={`${uid}-title`}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); setOpen(false); } }}>
      <p id={`${uid}-title`} className="text-base font-semibold text-lake-950">
        Have you paid {money(amount)} back to the {guestWord}?
      </p>
      <p className="mt-0.5 text-sm leading-snug text-lake-800">
        Mark it only once the money has been sent. The {guestWord} can report it if it does not arrive.
      </p>
      <label htmlFor={`${uid}-note`} className="mt-3 block text-sm font-semibold text-lake-800">
        Payment reference or note <span className="font-normal">(optional)</span>
      </label>
      <input id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
        placeholder="e.g. EcoCash ref 12345"
        className="mt-1.5 block w-full min-w-0 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none placeholder:text-lake-600 focus:border-lake-600" />
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={save} aria-disabled={busy}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-sunset-500 px-3.5 py-2 text-sm font-bold text-lake-950 outline-none hover:bg-sunset-400 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 ${busy ? 'cursor-not-allowed opacity-70' : ''}`}>
          {busy && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? 'Saving' : 'Yes, mark refunded'}
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-disabled={busy} className={portalButtonSecondary}>Not yet</button>
      </div>
    </motion.div>
  );
}

/** The guest's or partner's "Report not received". */
function ReportNotReceived({ bookingId, onDone }: { bookingId: string; onDone?: () => void }) {
  const uid = useId();
  const panel = useInlinePanel();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await reportRefundNotReceived(bookingId); setOpen(false); onDone?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send this report.'); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <div className="mt-3">
        <button type="button" onClick={() => setOpen(true)} className={portalButtonSecondary}>
          <Flag size={15} aria-hidden /> Report not received
        </button>
      </div>
    );
  }
  return (
    <motion.div {...panel} className="mt-3 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-3.5"
      role="group" aria-labelledby={`${uid}-title`}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); setOpen(false); } }}>
      <p id={`${uid}-title`} className="flex items-start gap-2 text-base font-semibold text-amber-950">
        <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> Report the refund as not received?
      </p>
      <p className="mt-1 text-sm leading-snug text-amber-950">
        Kariba Lake Connect will follow it up with the operator. We cannot pay the refund ourselves, but we can
        suspend an operator's listings if they do not pay.
      </p>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={send} aria-disabled={busy}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-sunset-500 px-3.5 py-2 text-sm font-bold text-lake-950 outline-none hover:bg-sunset-400 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 ${busy ? 'cursor-not-allowed opacity-70' : ''}`}>
          {busy && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? 'Sending' : 'Yes, report it'}
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-disabled={busy} className={portalButtonSecondary}>Not now</button>
      </div>
    </motion.div>
  );
}
