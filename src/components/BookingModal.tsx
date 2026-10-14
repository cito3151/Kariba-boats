import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { PublicBoat } from '../services/boats.service';
import { createBooking } from '../services/bookings.service';
import { DAY_END, DAY_START, minutesToTime, toISODate } from '../data/availability';
import { useCurrentDocuments } from './legal/useCurrentDocuments';
import DocumentModal from './legal/DocumentModal';
import { portalButtonPrimaryLarge } from './portal/styles';
import { REVEAL_STAGGER, revealSpring } from './motion';

const START_TIMES = Array.from({ length: DAY_END - DAY_START - 1 }, (_, i) =>
  minutesToTime((DAY_START + i) * 60),
);
const DURATIONS = [2, 3, 4, 6, 8];

const EXPERIENCES = [
  { value: 'sunset', label: 'Sunset cruise' },
  { value: 'fishing', label: 'Fishing trip' },
  { value: 'houseboat', label: 'Houseboat stay' },
  { value: 'private', label: 'Private charter' },
  { value: 'wildlife', label: 'Wildlife viewing' },
  { value: 'family', label: 'Family trip' },
];

// The booking flow's type scale: step headings 16px uppercase with tracking,
// labels 14px, everything typed or read 16px (which also stops iOS zooming into
// a field), the total at 32px. Nothing important is under 14px, and every text
// colour on white is lake-700 or darker.
const stepHeading = 'text-base font-extrabold uppercase tracking-[0.05em] text-lake-950';
const fieldLabel = 'block text-sm font-semibold text-lake-800';
const fieldInput =
  'mt-1.5 block w-full min-h-12 rounded-lg border border-lake-200 bg-white px-3.5 py-2.5 text-base text-lake-950 outline-none transition-[border-color,box-shadow] focus:border-lake-600 focus:ring-2 focus:ring-lake-600/25';
const fieldHint = 'mt-1.5 text-sm leading-snug text-lake-700';
const figureLabel = 'text-sm font-semibold uppercase tracking-[0.05em] text-lake-700';
const rateOption =
  'rounded-lg border px-3.5 py-2.5 text-left outline-none transition-[background-color,border-color,scale] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2';
const rateOn = 'border-lake-950 bg-lake-50 text-lake-950 ring-1 ring-lake-950';
const rateOff = 'border-lake-200 bg-white text-lake-800 hover:bg-lake-50';

/** "Fri 12 Jun 2026", for the confirmation. */
function formatDay(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

interface Props {
  boat: PublicBoat;
  touristId: string | null;
  hotelId?: string | null;
  // True when staff book for someone else (hotel or travel agency). The guest fields
  // then start empty whatever initialName and initialPhone say: those are the signed-in
  // user's own details, and the booking would otherwise go out under the staff
  // member's name. A hotelId implies it.
  onBehalfOfGuest?: boolean;
  initialName?: string;
  initialPhone?: string;
  // Dates picked on the boat page calendar. They only prefill the date inputs,
  // which stay editable. `initialEndDate` is for daily trips; an hourly boat gets
  // the start date alone, which is the single date of the trip.
  initialStartDate?: string;
  initialEndDate?: string;
  onClose: () => void;
  /** Fired once the server has accepted the request, before the success screen. */
  onBooked?: () => void;
}

type Step = 'form' | 'submitting' | 'success';

export default function BookingModal({
  boat, touristId, hotelId = null, onBehalfOfGuest = false, initialName = '', initialPhone = '',
  initialStartDate = '', initialEndDate = '', onClose, onBooked,
}: Props) {
  const onBehalf = onBehalfOfGuest || hotelId !== null;
  const nameHintId = useId();
  const reduce = useReducedMotion();
  // `> 0`, not just non-null: a rate of 0 means the owner did not offer that
  // basis. Checking only for null opened this modal on "Daily, $0/day" for a boat
  // priced hourly, and the server agreed, so the trip was booked for nothing.
  const hasHourly = boat.pricePerHour != null && boat.pricePerHour > 0;
  const hasDaily = boat.pricePerDay != null && boat.pricePerDay > 0;

  const [step, setStep] = useState<Step>('form');
  const [guestName, setGuestName] = useState(onBehalf ? '' : initialName);
  const [guestPhone, setGuestPhone] = useState(onBehalf ? '' : initialPhone);
  const [date, setDate] = useState(initialStartDate);
  // A one-day daily trip arrives with no end date; the end defaults to the start.
  const [endDate, setEndDate] = useState(initialEndDate || (hasDaily ? initialStartDate : ''));
  const [startTime, setStartTime] = useState('16:00');
  const [durationHours, setDurationHours] = useState(2);
  const [groupSize, setGroupSize] = useState(2);
  const [experienceType, setExperienceType] = useState('sunset');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [depositAmount, setDepositAmount] = useState(0);
  const [bookingId, setBookingId] = useState('');
  // The customer-facing booking reference (KLC-XXXXXX, from create_booking), shown
  // as its own box on the success screen. Undefined only if the server did not
  // return one, when the screen falls back to the short booking id.
  const [bookingReference, setBookingReference] = useState<string | undefined>(undefined);
  const { get: getDoc } = useCurrentDocuments();
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [showWaiver, setShowWaiver] = useState(false);
  // Default to daily when available (so a range picked on the calendar lands in daily
  // mode); hourly only otherwise. Tourist can switch when both exist.
  const [rateMode, setRateMode] = useState<'hour' | 'day'>(hasDaily ? 'day' : 'hour');

  const isHourly = rateMode === 'hour';
  const amount = isHourly ? (boat.pricePerHour ?? 0) : (boat.pricePerDay ?? 0);
  const days = (() => {
    if (isHourly) return 1;
    if (!date || !endDate) return 1;
    const ms = new Date(endDate).getTime() - new Date(date).getTime();
    return ms >= 0 ? Math.round(ms / 86_400_000) + 1 : 1;
  })();
  const priceTotal = isHourly ? amount * durationHours : amount * days;
  const deposit = Math.round((priceTotal * boat.depositPercent) / 100);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isHourly && (!endDate || endDate < date)) {
      setError('Choose an end date on or after the start date.');
      return;
    }
    if (!waiverAccepted) {
      setError('Please accept the booking waiver to continue.');
      return;
    }
    const waiverDoc = getDoc('booking_waiver');
    setStep('submitting');
    try {
      const result = await createBooking(
        {
          boatId: boat.id,
          guestName,
          guestPhone,
          hotelId,
          startDate: date,
          days,
          startTime: isHourly ? startTime : null,
          durationHours: isHourly ? durationHours : null,
          groupSize,
          experienceType,
          priceTotal,
          depositAmount: deposit,
          notes,
          waiverVersion: waiverDoc?.version ?? 1,
          waiverAccepted: true,
        },
        touristId,
      );
      setBookingId(result.id);
      setBookingReference(result.reference);
      setDepositAmount(result.depositAmount);
      setStep('success');
      onBooked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That slot is no longer available.');
      setStep('form');
    }
  };

  // Each step slides in from the right and out to the left, a short critically
  // damped move with a fade, so form, sending and confirmation read as one flow
  // moving forward. Under reduced motion the steps only cross-fade.
  const stepMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
      initial: { opacity: 0, x: 24 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -24, transition: { duration: 0.15, ease: 'easeIn' } },
      transition: { type: 'spring', bounce: 0, duration: 0.35 },
    } as const;

  const whenText = isHourly
    ? `${formatDay(date)}, ${startTime} for ${durationHours} hours`
    : days > 1 && endDate
      ? `${formatDay(date)} to ${formatDay(endDate)} (${days} days)`
      : formatDay(date);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-lake-950/60 p-0 sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${nameHintId}-title`}
          onClick={(e) => e.stopPropagation()}
          // A sheet rising from the foot of the screen on a phone, a card settling
          // in the middle on a wider one: critically damped, nothing overshoots.
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', bounce: 0, duration: 0.4 }}
          className="w-full sm:max-w-lg max-h-[92svh] overflow-y-auto overflow-x-hidden rounded-t-2xl sm:rounded-xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold uppercase tracking-[0.06em] text-lake-700">{boat.name}</p>
              <h2 id={`${nameHintId}-title`} className="mt-1 text-2xl font-extrabold text-lake-950 sm:text-[28px]">
                {onBehalf ? 'Book on behalf of guest' : 'Request to book'}
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-lake-700 outline-none transition-colors hover:bg-lake-50 hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
              <X size={22} />
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {step === 'form' && (
              <motion.form key="form" {...stepMotion} onSubmit={submit} className="mt-6 space-y-7">
                <section aria-labelledby={`${nameHintId}-trip`} className="space-y-4">
                  <h3 id={`${nameHintId}-trip`} className={stepHeading}>Your trip</h3>
                  {hasHourly && hasDaily && (
                    <div role="group" aria-label="Hire by the day or by the hour" className="grid grid-cols-2 gap-2">
                      <button type="button" aria-pressed={rateMode === 'day'} onClick={() => setRateMode('day')}
                        className={`${rateOption} ${rateMode === 'day' ? rateOn : rateOff}`}>
                        <span className="block text-sm font-semibold">Daily</span>
                        <span className="block text-lg font-bold tabular-nums">${boat.pricePerDay}<span className="text-sm font-medium"> / day</span></span>
                      </button>
                      <button type="button" aria-pressed={rateMode === 'hour'} onClick={() => setRateMode('hour')}
                        className={`${rateOption} ${rateMode === 'hour' ? rateOn : rateOff}`}>
                        <span className="block text-sm font-semibold">Hourly</span>
                        <span className="block text-lg font-bold tabular-nums">${boat.pricePerHour}<span className="text-sm font-medium"> / hour</span></span>
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label htmlFor={`${nameHintId}-date`} className={fieldLabel}>{isHourly ? 'Date' : 'Start date'}</label>
                      <input id={`${nameHintId}-date`} required type="date" min={toISODate(new Date())} value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className={fieldInput} />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`${nameHintId}-group`} className={fieldLabel}>Group size</label>
                      <input id={`${nameHintId}-group`} required type="number" min={1} max={boat.capacity} value={groupSize}
                        onChange={(e) => setGroupSize(Number(e.target.value) || 1)}
                        className={`${fieldInput} tabular-nums`} />
                    </div>
                  </div>

                  {isHourly ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <label htmlFor={`${nameHintId}-time`} className={fieldLabel}>Start time</label>
                        <select id={`${nameHintId}-time`} value={startTime} onChange={(e) => setStartTime(e.target.value)}
                          className={`${fieldInput} tabular-nums`}>
                          {START_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`${nameHintId}-duration`} className={fieldLabel}>Duration</label>
                        <select id={`${nameHintId}-duration`} value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))}
                          className={fieldInput}>
                          {DURATIONS.map((d) => <option key={d} value={d}>{d} hours</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor={`${nameHintId}-end`} className={fieldLabel}>End date</label>
                      <input id={`${nameHintId}-end`} required type="date" min={date || toISODate(new Date())} value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        aria-describedby={`${nameHintId}-days`}
                        className={fieldInput} />
                      <p id={`${nameHintId}-days`} className={fieldHint}>
                        <span className="font-semibold tabular-nums text-lake-950">{days} day{days > 1 ? 's' : ''}</span> total, start and end inclusive.
                      </p>
                    </div>
                  )}

                  <div>
                    <label htmlFor={`${nameHintId}-experience`} className={fieldLabel}>Experience</label>
                    <select id={`${nameHintId}-experience`} value={experienceType} onChange={(e) => setExperienceType(e.target.value)}
                      className={fieldInput}>
                      {EXPERIENCES.map((exp) => <option key={exp.value} value={exp.value}>{exp.label}</option>)}
                    </select>
                  </div>
                </section>

                <section aria-labelledby={`${nameHintId}-details`} className="space-y-4">
                  <h3 id={`${nameHintId}-details`} className={stepHeading}>
                    {onBehalf ? "Guest's details" : 'Your details'}
                  </h3>
                  <div>
                    <label htmlFor={`${nameHintId}-name`} className={fieldLabel}>
                      {onBehalf ? "Guest's full name" : 'Your full name'}
                    </label>
                    <input id={`${nameHintId}-name`} required value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      aria-describedby={!onBehalf && initialName ? nameHintId : undefined}
                      className={fieldInput}
                      placeholder="e.g. Jane Moyo" />
                    {/* Only when the name came from the profile, so it never reads as a
                        question about a field the user typed into themselves. */}
                    {!onBehalf && initialName && (
                      <p id={nameHintId} className={fieldHint}>
                        Booking for yourself? Check your name is right.
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`${nameHintId}-phone`} className={fieldLabel}>
                      {onBehalf ? "Guest's phone / WhatsApp" : 'Your phone / WhatsApp'}
                    </label>
                    <input id={`${nameHintId}-phone`} required value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
                      className={`${fieldInput} tabular-nums`}
                      placeholder="+263 77 000 0000" />
                  </div>
                  <div>
                    <label htmlFor={`${nameHintId}-notes`} className={fieldLabel}>
                      Notes <span className="font-normal text-lake-700">(optional)</span>
                    </label>
                    <textarea id={`${nameHintId}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                      className={`${fieldInput} resize-y leading-relaxed`}
                      placeholder="Any special requests..." />
                  </div>
                </section>

                <section aria-labelledby={`${nameHintId}-price`}>
                  <h3 id={`${nameHintId}-price`} className={stepHeading}>Price summary</h3>
                  <dl className="mt-3 rounded-lg border border-lake-200 bg-lake-50 px-4 text-[15px]">
                    <div className="flex items-baseline justify-between gap-4 py-3">
                      <dt className="text-lake-800">
                        {isHourly ? `$${amount} per hour × ${durationHours} hours` : `$${amount} per day × ${days} day${days > 1 ? 's' : ''}`}
                      </dt>
                      <dd className="font-semibold tabular-nums text-lake-950">${priceTotal}</dd>
                    </div>
                    <div className="flex items-end justify-between gap-4 border-t-2 border-lake-950 py-3">
                      <dt className="pb-1 text-base font-extrabold uppercase tracking-[0.05em] text-lake-950">Total</dt>
                      <dd className="text-[32px] font-extrabold leading-none tabular-nums text-lake-950">${priceTotal}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 border-t border-lake-200 py-3">
                      <dt className="text-lake-800">Deposit to confirm ({boat.depositPercent}%)</dt>
                      <dd className="font-bold tabular-nums text-lake-950">${deposit}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 border-t border-lake-200 py-3">
                      <dt className="text-lake-800">Balance paid on the day</dt>
                      <dd className="font-semibold tabular-nums text-lake-950">${priceTotal - deposit}</dd>
                    </div>
                  </dl>
                </section>

                <div className="space-y-4">
                  {error && (
                    <motion.div role="alert" initial={{ opacity: 0, y: reduce ? 0 : -6 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-3 text-[15px] leading-snug text-red-800">
                      <AlertCircle size={18} className="mt-px shrink-0" aria-hidden /> {error}
                    </motion.div>
                  )}

                  {/* The whole row is the target (48px tall, full width), not just the box.
                      leading-6 with the box 2px down sets the first line level with it, and a
                      wrapped line stays under the text, not under the box. */}
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-lake-200 bg-white p-3.5 text-base leading-6 text-lake-800 transition-colors has-checked:border-lake-700 has-checked:bg-lake-50">
                    <input type="checkbox" checked={waiverAccepted}
                      onChange={(e) => setWaiverAccepted(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-lake-700 outline-none focus-visible:ring-2 focus-visible:ring-lake-800 focus-visible:ring-offset-2" />
                    <span>
                      I accept the{' '}
                      <button type="button"
                        className="rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-800 focus-visible:ring-offset-1"
                        onClick={() => setShowWaiver(true)}>booking liability waiver</button>.
                    </span>
                  </label>
                  {/* New tabs, so the filled-in request is still here afterwards. */}
                  <p className="-mt-2 text-sm leading-normal text-lake-700">
                    Deposits, cancellations and refunds are covered by our{' '}
                    <Link to="/terms" target="_blank" rel="noopener noreferrer"
                      className="rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-800">
                      Terms and Conditions<span className="sr-only"> (opens in a new tab)</span>
                    </Link>
                    . How we use your details:{' '}
                    <Link to="/privacy" target="_blank" rel="noopener noreferrer"
                      className="rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-800">
                      Privacy Policy<span className="sr-only"> (opens in a new tab)</span>
                    </Link>.
                  </p>

                  <button type="submit" className={`${portalButtonPrimaryLarge} w-full`}>
                    Send request to {boat.operatorName || 'the operator'}
                  </button>
                  <p className="text-center text-sm text-lake-700">No charge until the operator confirms.</p>
                </div>
              </motion.form>
            )}

            {step === 'submitting' && (
              <motion.div key="submitting" {...stepMotion} role="status"
                className="my-12 flex flex-col items-center gap-4 text-center">
                <Loader2 size={36} className="animate-spin text-lake-700" aria-hidden />
                <p className="text-base font-semibold text-lake-900">Sending request to operator…</p>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div key="success" {...stepMotion}>
                <BookingConfirmation
                  bookingReference={bookingReference}
                  bookingId={bookingId}
                  operatorName={boat.operatorName}
                  boatName={boat.name}
                  when={whenText}
                  groupSize={groupSize}
                  priceTotal={priceTotal}
                  depositAmount={depositAmount}
                  onDone={onClose}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
      {showWaiver && <DocumentModal docType="booking_waiver" onClose={() => setShowWaiver(false)} />}
    </AnimatePresence>
  );
}

/**
 * The success step, set out as a booking confirmation: a calm tick, the heading,
 * the booking reference in its own box, then what was requested as labelled
 * figures and the deposit due.
 *
 * `bookingReference` is the slot for the customer-facing reference number. The
 * box is drawn only when it is present; until then the screen falls back to the
 * short booking id it has always shown.
 */
function BookingConfirmation({
  bookingReference, bookingId, operatorName, boatName, when, groupSize, priceTotal, depositAmount, onDone,
}: {
  bookingReference?: string;
  bookingId: string;
  operatorName: string | null | undefined;
  boatName: string;
  when: string;
  groupSize: number;
  priceTotal: number;
  depositAmount: number;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  // The parts settle in one after another, top to bottom: a slow, even rise with
  // no overshoot. Under reduced motion they fade in together.
  const part = (i: number) => (reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
    : {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { ...revealSpring, delay: 0.1 + i * REVEAL_STAGGER },
    });

  return (
    <div className="mt-6">
      <div className="flex flex-col items-center text-center">
        <motion.span
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', bounce: 0, duration: 0.5, delay: 0.05 }}
          className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50"
        >
          <CheckCircle2 size={36} className="text-emerald-700" aria-hidden />
        </motion.span>
        <motion.h3 {...part(0)} className="mt-4 text-2xl font-extrabold text-lake-950">Request sent</motion.h3>
        <motion.p {...part(1)} className="mt-2 max-w-sm text-base leading-relaxed text-lake-800">
          {bookingReference ? (
            <>Your request is with {operatorName || 'the operator'} and is awaiting their confirmation.</>
          ) : (
            <>Booking <span className="font-mono font-semibold text-lake-950">{bookingId.slice(0, 8)}</span> is awaiting operator confirmation.</>
          )}
        </motion.p>
      </div>

      {bookingReference && (
        <motion.div {...part(2)} className="mt-6 rounded-lg border-2 border-lake-950 bg-lake-50 px-4 py-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.06em] text-lake-700">Booking reference</p>
          <p className="mt-1 select-all break-all text-[28px] font-extrabold leading-tight tracking-[0.06em] tabular-nums text-lake-950">
            {bookingReference}
          </p>
          <p className="mt-1 text-sm text-lake-700">Quote it whenever you contact the operator.</p>
          <p className="mt-3 border-t border-lake-200 pt-3 text-[15px] leading-snug text-lake-800">
            Keep this number to track your booking.{' '}
            <Link to={`/track?ref=${encodeURIComponent(bookingReference)}`} onClick={onDone}
              className="rounded-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-800 focus-visible:ring-offset-1">
              Track your booking
            </Link>
          </p>
        </motion.div>
      )}

      <motion.dl {...part(3)} className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-lake-200 pt-5">
        <div className="col-span-2 min-w-0">
          <dt className={figureLabel}>Boat</dt>
          <dd className="mt-0.5 break-words text-base font-semibold text-lake-950">{boatName}</dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className={figureLabel}>When</dt>
          <dd className="mt-0.5 text-base tabular-nums text-lake-950">{when}</dd>
        </div>
        <div className="min-w-0">
          <dt className={figureLabel}>Group</dt>
          <dd className="mt-0.5 text-base tabular-nums text-lake-950">{groupSize} guest{groupSize > 1 ? 's' : ''}</dd>
        </div>
        <div className="min-w-0">
          <dt className={figureLabel}>Trip total</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-lake-950">${priceTotal}</dd>
        </div>
      </motion.dl>

      <motion.div {...part(4)} className="mt-5 flex items-end justify-between gap-4 rounded-lg bg-lake-50 px-4 py-3.5">
        <span className="pb-0.5 text-[15px] font-semibold text-lake-800">Deposit due once confirmed</span>
        <span className="text-[28px] font-extrabold leading-none tabular-nums text-lake-950">${depositAmount}</span>
      </motion.div>

      <motion.div {...part(5)}>
        <button type="button" onClick={onDone} className={`${portalButtonPrimaryLarge} mt-6 w-full`}>
          Done
        </button>
      </motion.div>
    </div>
  );
}
