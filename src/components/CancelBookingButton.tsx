import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Ban, HeartPulse, Loader2, X } from 'lucide-react';
import { cancelBooking, getCancellationQuote, tripWhen } from '../services/bookings.service';
import type { BookingRow, CancellationQuote } from '../services/bookings.service';
import {
  OFF_PLATFORM_NOTE, POLICY_INFO, REASON_LABELS, RULE_TEXT, longDate, money, reasonsFor,
} from '../data/cancellation';
import type { CancelReason, CancelledByParty } from '../data/cancellation';
import { portalButtonSecondary } from './portal/styles';
import BookingRef from './BookingRef';

// Cancelling has no undo, and it can cost the guest part of their deposit, so it is
// a dialog that shows the price of cancelling before anything happens (the Viator
// cancel-quote pattern, ADR-003 section 1.5). The dialog:
//  * asks the server for a quote (cancellation_quote): who the caller is to this
//    booking, the policy, the fee the operator keeps and the refund it owes;
//  * asks for a reason, from the list that canceller may use, and an optional note;
//  * offers the compassionate exemption (death or hospitalisation) where the ADR
//    allows it: to the guest, the hotel or agency that booked, and admins;
//  * re-quotes as the reason changes, so the figures shown are the ones recorded.
// Used wherever a booking can be cancelled: My Trips, the hotel and agency portals,
// the owner's bookings and the admin bookings list.

interface Props {
  booking: Pick<BookingRow, 'id' | 'reference' | 'boatName' | 'startDate' | 'days' | 'startTime' | 'durationHours' | 'status'>;
  /** Runs once the server has cancelled the booking. Normally the list's reload. */
  onCancelled: () => void;
  /** Disables the button, e.g. while another action on the same booking runs. */
  disabled?: boolean;
  /** What a hotel calls its guest and an agency its client. */
  guestWord?: 'guest' | 'client';
}

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

export default function CancelBookingButton({ booking, onCancelled, disabled = false, guestWord = 'guest' }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (cancelled: boolean) => {
    setOpen(false);
    if (cancelled) {
      setDone(true);
      onCancelled();
    } else {
      // Back to the button that opened the dialog, once it is on screen again.
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  return (
    <div>
      <span role="status" aria-live="polite" className="sr-only">{done ? 'Booking cancelled.' : ''}</span>
      {done ? (
        <p className="text-sm font-medium text-lake-700" aria-hidden>Booking cancelled</p>
      ) : (
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)} disabled={disabled}
          aria-haspopup="dialog"
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 focus-visible:ring-red-500 ${FOCUS_RING}`}>
          <Ban size={15} aria-hidden /> Cancel
        </button>
      )}
      <AnimatePresence>
        {open && <CancelDialog booking={booking} guestWord={guestWord} onClose={close} />}
      </AnimatePresence>
    </div>
  );
}

/** The reason's label, in the voice of the person cancelling. */
function reasonLabel(reason: CancelReason, party: CancelledByParty, guestWord: string): string {
  if (party === 'guest') {
    if (reason === 'guest_request') return 'My plans changed, or I can no longer go';
    if (reason === 'guest_compassionate') return 'Death or hospitalisation';
  }
  if (party === 'partner') {
    if (reason === 'guest_request') return `The ${guestWord} asked to cancel`;
    if (reason === 'partner_error') return 'Our error: the booking was made by mistake';
    if (reason === 'guest_compassionate') return `Death or hospitalisation (the ${guestWord} or close family)`;
  }
  if (party === 'operator') {
    switch (reason) {
      case 'weather_safety': return 'Weather or lake conditions make the trip unsafe';
      case 'boat_breakdown': return 'The boat has broken down';
      case 'operator_unavailable': return 'We cannot run the trip (crew or boat unavailable)';
      case 'guest_request': return 'The guest asked us to cancel';
      case 'guest_no_show': return 'The guest did not show up';
      case 'other': return 'Another reason (add a note)';
      default: break;
    }
  }
  return reason === 'other' ? 'Other (add a note)' : REASON_LABELS[reason];
}

/** The quote in one plain sentence, as ADR-003 words it. */
function quoteSentence(q: CancellationQuote, party: CancelledByParty, guestWord: string): string {
  const who = party === 'guest' ? 'you' : `the ${guestWord}`;
  if (q.ruleApplied === 'request_only') {
    return 'The operator has not confirmed this request and nothing has been paid, so there is no fee.';
  }
  if (!q.depositPaid) {
    return 'No deposit has been paid yet, so there is no fee and nothing to refund.';
  }
  const by = q.refundDueBy ? ` by ${longDate(q.refundDueBy)}` : '';
  if (q.feeAmount === 0) {
    return `The operator refunds the whole ${money(q.depositAmount)} deposit to ${who}${by}.`;
  }
  if (q.refundAmount === 0) {
    return q.ruleApplied === 'no_show'
      ? `As a no-show, the operator keeps the whole ${money(q.depositAmount)} deposit.`
      : `Under the ${POLICY_INFO[q.policy].label} policy the operator keeps the whole ${money(q.depositAmount)} deposit. Nothing is refunded.`;
  }
  return `Under the ${POLICY_INFO[q.policy].label} policy the operator keeps ${money(q.feeAmount)} of the ${money(q.depositAmount)} deposit and refunds ${money(q.refundAmount)} to ${who}${by}.`;
}

function daysText(n: number): string {
  if (n > 1) return `${n} days before the trip`;
  if (n === 1) return '1 day before the trip';
  if (n === 0) return 'on the day of the trip';
  return 'after the trip date';
}

type QuoteState =
  | { kind: 'loading' }
  | { kind: 'ready'; quote: CancellationQuote }
  | { kind: 'refused'; message: string };

function CancelDialog({ booking, guestWord, onClose }: {
  booking: Props['booking']; guestWord: string; onClose: (cancelled: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [state, setState] = useState<QuoteState>({ kind: 'loading' });
  // The party and start state come from the first quote and do not change while the
  // dialog is open; the figures are re-quoted for each reason.
  const [party, setParty] = useState<CancelledByParty | null>(null);
  const [started, setStarted] = useState(false);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState('');
  const [requoting, setRequoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestNo = useRef(0);

  const compassionate = reason === 'guest_compassionate';

  // First quote, with no reason chosen yet.
  useEffect(() => {
    let live = true;
    headingRef.current?.focus();
    getCancellationQuote(booking.id)
      .then((q) => {
        if (!live) return;
        setParty(q.callerParty);
        setStarted(q.tripStarted);
        setState({ kind: 'ready', quote: q });
      })
      .catch((e) => { if (live) setState({ kind: 'refused', message: e instanceof Error ? e.message : 'This booking cannot be cancelled.' }); });
    return () => { live = false; };
  }, [booking.id]);

  const choose = (r: CancelReason) => {
    setReason(r);
    setError('');
    const n = ++requestNo.current;
    setRequoting(true);
    getCancellationQuote(booking.id, r === 'guest_compassionate' ? 'guest_request' : r, r === 'guest_compassionate')
      .then((q) => { if (n === requestNo.current) setState({ kind: 'ready', quote: q }); })
      .catch((e) => { if (n === requestNo.current) setError(e instanceof Error ? e.message : 'Could not update the quote.'); })
      .finally(() => { if (n === requestNo.current) setRequoting(false); });
  };

  const close = () => { if (!busy) onClose(false); };

  const noteRequired = reason === 'other';
  const noteMissing = noteRequired && note.trim().length === 0;

  const confirm = async () => {
    if (busy || requoting) return;
    setTried(true);
    if (!reason || noteMissing) return;
    setBusy(true);
    setError('');
    try {
      await cancelBooking(booking.id, {
        reason: compassionate ? 'guest_request' : reason,
        compassionate,
        note,
      });
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel this booking.');
      setBusy(false);
    }
  };

  const options: CancelReason[] = party
    ? [
      ...reasonsFor(party, started),
      // The compassionate exemption: for whoever cancels for the guest, never the
      // operator (an operator cancellation refunds the whole deposit anyway), and
      // only where there could be a fee.
      ...(party !== 'operator' && booking.status !== 'requested' ? ['guest_compassionate' as const] : []),
    ]
    : [];

  const quote = state.kind === 'ready' ? state.quote : null;
  const overrideRule = quote && ['cooling_off', 'compassionate', 'operator_cancelled', 'no_show'].includes(quote.ruleApplied);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-lake-950/60 p-0 sm:items-center sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}
    >
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        // A sheet from the foot of a phone, a card in the middle of a wider screen,
        // critically damped. Reduced motion keeps only the fade.
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
        transition={reduce ? { duration: 0.2 } : { type: 'spring', bounce: 0, duration: 0.4 }}
        className="max-h-[92svh] w-full overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold uppercase tracking-[0.06em] text-lake-700">{booking.boatName}</p>
            <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1}
              className="mt-1 text-2xl font-extrabold text-lake-950 outline-none">
              Cancel this booking?
            </h2>
          </div>
          <button type="button" onClick={close} aria-label="Close"
            className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-lake-700 outline-none transition-colors hover:bg-lake-50 hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
            <X size={22} aria-hidden />
          </button>
        </div>
        <BookingRef reference={booking.reference} className="mt-3" />
        <p className="mt-1.5 break-words text-[15px] leading-snug text-lake-800">{tripWhen(booking)}</p>

        {state.kind === 'loading' && (
          <p role="status" className="mt-6 flex items-center gap-2 text-base text-lake-800">
            <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> Working out what cancelling would cost
          </p>
        )}

        {state.kind === 'refused' && (
          <>
            <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-3 text-[15px] leading-snug text-red-800">
              <AlertCircle size={18} className="mt-px shrink-0" aria-hidden /> {state.message}
            </p>
            <div className="mt-5">
              <button type="button" onClick={close} className={portalButtonSecondary}>Close</button>
            </div>
          </>
        )}

        {quote && party && (
          <div className="mt-5 space-y-5">
            {/* The quote: the figures the server will record for this reason. */}
            <section aria-labelledby={`${uid}-quote`} aria-live="polite" aria-busy={requoting || undefined}
              className={`rounded-lg border border-lake-200 bg-lake-50 p-3.5 transition-opacity ${requoting ? 'opacity-70' : ''}`}>
              <h3 id={`${uid}-quote`} className="text-sm font-bold uppercase tracking-[0.05em] text-lake-800">What cancelling now means</h3>
              <p className="mt-1.5 text-base font-semibold leading-snug text-lake-950">{quoteSentence(quote, party, guestWord)}</p>
              {overrideRule && (
                <p className="mt-1 text-[15px] leading-snug text-lake-800">{RULE_TEXT[quote.ruleApplied]}</p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-lake-200 pt-3 text-[15px]">
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-lake-700">Policy</dt>
                  <dd className="text-lake-950">{POLICY_INFO[quote.policy].label}, {daysText(quote.daysBefore)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-lake-700">Deposit</dt>
                  <dd className="tabular-nums text-lake-950">{money(quote.depositAmount)}, {quote.depositPaid ? 'paid' : 'not paid'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-lake-700">Operator keeps</dt>
                  <dd className="font-semibold tabular-nums text-lake-950">{money(quote.feeAmount)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-lake-700">Refund owed</dt>
                  <dd className="font-semibold tabular-nums text-lake-950">
                    {money(quote.refundAmount)}{quote.refundDueBy ? `, by ${longDate(quote.refundDueBy)}` : ''}
                  </dd>
                </div>
              </dl>
              {quote.refundAmount > 0 && (
                <p className="mt-3 text-sm leading-snug text-lake-800">{OFF_PLATFORM_NOTE}</p>
              )}
            </section>

            <fieldset aria-describedby={tried && !reason ? `${uid}-reason-error` : undefined}>
              <legend className="text-sm font-semibold text-lake-800">
                {party === 'guest' ? 'Why are you cancelling?' : 'Reason for cancelling'}
              </legend>
              <div className="mt-2 space-y-2">
                {options.map((r) => (
                  <label key={r}
                    className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-lake-200 bg-white p-3 text-base leading-6 text-lake-900 transition-colors has-checked:border-lake-700 has-checked:bg-lake-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lake-500">
                    <input type="radio" name={`${uid}-reason`} value={r} checked={reason === r}
                      onChange={() => choose(r)}
                      className="mt-1 h-4 w-4 shrink-0 accent-lake-700 outline-none" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        {r === 'guest_compassionate' && <HeartPulse size={16} className="shrink-0 text-lake-700" aria-hidden />}
                        {reasonLabel(r, party, guestWord)}
                      </span>
                      {r === 'guest_compassionate' && (
                        <span className="mt-0.5 block text-sm leading-snug text-lake-700">
                          No fee if {party === 'guest' ? 'you, the person the trip is for,' : `the ${guestWord}`} or a close
                          family member has died or is in hospital. The operator may ask for evidence through support.
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {tried && !reason && (
                <p id={`${uid}-reason-error`} className="mt-1.5 text-sm font-medium text-red-700">Choose a reason to continue.</p>
              )}
            </fieldset>

            <div>
              <label htmlFor={`${uid}-note`} className="block text-sm font-semibold text-lake-800">
                Note {noteRequired ? '' : <span className="font-normal">(optional)</span>}
              </label>
              <textarea id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)}
                rows={3} maxLength={500}
                aria-invalid={tried && noteMissing ? true : undefined}
                aria-describedby={`${uid}-note-hint`}
                className="mt-1.5 block w-full min-w-0 resize-y rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base leading-normal text-lake-950 outline-none focus:border-lake-600 focus:ring-2 focus:ring-lake-600/25 aria-[invalid=true]:border-red-400" />
              <p id={`${uid}-note-hint`} className={`mt-1 text-sm ${tried && noteMissing ? 'font-medium text-red-700' : 'text-lake-700'}`}>
                {tried && noteMissing
                  ? 'Add a short note saying why.'
                  : `Seen by everyone on this booking. ${note.length} of 500 characters.`}
              </p>
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-3 text-[15px] leading-snug text-red-800">
                <AlertCircle size={18} className="mt-px shrink-0" aria-hidden /> {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={close} aria-disabled={busy}
                className={`${portalButtonSecondary} min-h-11 ${busy ? 'cursor-not-allowed opacity-60' : ''}`}>
                Keep booking
              </button>
              {/* aria-disabled, not disabled: a focused button that becomes disabled
                  drops keyboard focus to the page mid-request. */}
              <button type="button" onClick={confirm} aria-disabled={busy || requoting}
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 focus-visible:ring-red-700 ${FOCUS_RING} ${busy || requoting ? 'cursor-not-allowed opacity-70' : ''}`}>
                {busy ? <><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> Cancelling</> : 'Yes, cancel booking'}
              </button>
            </div>
            <p className="text-sm leading-snug text-lake-700">This cannot be undone.</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
