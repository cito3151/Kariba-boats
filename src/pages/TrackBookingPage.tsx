import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check, X, Loader2, AlertCircle, SearchX, MapPin, ClipboardList, BadgeCheck, Wallet, Flag,
  type LucideIcon,
} from 'lucide-react';
import PortalPage from '../components/portal/PortalPage';
import PortalSection from '../components/portal/PortalSection';
import { portalCard, portalButtonPrimaryLarge } from '../components/portal/styles';
import StatusBadge from '../components/StatusBadge';
import { Figure } from '../components/BookingFigures';
import { riseOnMount } from '../components/motion';
import { portalPhotos } from '../data/photos';
import { trackBooking, tripWhen, tripPrice } from '../services/bookings.service';
import type { BookingStatus, TrackedBooking } from '../services/bookings.service';

// The public booking tracker. A guest types the reference from their confirmation
// and the phone number they booked with, signed in or not, and gets the booking's
// status as a cruise-style status card: badge, a four-step timeline and the trip.
// track_booking answers only when both match, so a wrong reference and a wrong
// phone read the same: "We couldn't find a booking with those details".

const fieldLabel = 'block text-sm font-semibold text-lake-800';
const fieldInput =
  'mt-1.5 block w-full min-h-12 rounded-lg border border-lake-200 bg-white px-3.5 py-2.5 text-base text-lake-950 outline-none transition-[border-color,box-shadow] focus:border-lake-600 focus:ring-2 focus:ring-lake-600/25';
const fieldHint = 'mt-1.5 text-sm leading-snug text-lake-700';

const STEPS: { status: BookingStatus; label: string; icon: LucideIcon }[] = [
  { status: 'requested', label: 'Requested', icon: ClipboardList },
  { status: 'confirmed', label: 'Confirmed', icon: BadgeCheck },
  { status: 'deposit_paid', label: 'Deposit paid', icon: Wallet },
  { status: 'completed', label: 'Completed', icon: Flag },
];

const SUMMARY: Record<BookingStatus, string> = {
  requested: 'Your request is with the operator, waiting for them to confirm it.',
  confirmed: 'The operator has confirmed your trip. Pay the deposit to secure the boat.',
  deposit_paid: 'Your deposit is in and the boat is yours. The balance is paid on the day.',
  completed: 'This trip is complete. Thank you for sailing Lake Kariba with us.',
  declined: 'The operator could not take this booking. Try another date or another boat.',
  cancelled: 'This booking has been cancelled.',
};

/** "12 Jun 2026", in the reader's locale-neutral house style. */
function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Result =
  | { kind: 'idle' }
  | { kind: 'found'; booking: TrackedBooking }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

export default function TrackBookingPage() {
  const id = useId();
  const reduce = useReducedMotion();
  const [params] = useSearchParams();
  const [reference, setReference] = useState(() => (params.get('ref') ?? '').toUpperCase());
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const booking = await trackBooking(reference.trim(), phone);
      setResult(booking ? { kind: 'found', booking } : { kind: 'none' });
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const arrive = riseOnMount(reduce, 0, 16);
  const leave = { opacity: 0, transition: { duration: 0.15 } };

  return (
    <PortalPage
      eyebrow="Booking tracker"
      icon={ClipboardList}
      photo={portalPhotos.trips}
      title="Track your booking"
      subtitle="Enter your booking reference and the phone number you booked with to see where your trip stands."
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Track your booking' }]}
    >
      <div className="grid items-start gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <PortalSection title="Find your booking" className="min-w-0">
          <form onSubmit={submit} className={`${portalCard} space-y-4 p-4 sm:p-5`}>
            <div>
              <label htmlFor={`${id}-ref`} className={fieldLabel}>Booking reference</label>
              <input id={`${id}-ref`} required value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                autoComplete="off" autoCapitalize="characters" spellCheck={false}
                aria-describedby={`${id}-ref-hint`}
                placeholder="KLC-7H3QXK"
                className={`${fieldInput} font-mono tracking-[0.04em]`} />
              <p id={`${id}-ref-hint`} className={fieldHint}>On your confirmation, starting KLC-.</p>
            </div>
            <div>
              <label htmlFor={`${id}-phone`} className={fieldLabel}>Phone number used for the booking</label>
              <input id={`${id}-phone`} required type="tel" inputMode="tel" autoComplete="tel"
                value={phone} onChange={(e) => setPhone(e.target.value)}
                aria-describedby={`${id}-phone-hint`}
                placeholder="+263 77 000 0000"
                className={`${fieldInput} tabular-nums`} />
              <p id={`${id}-phone-hint`} className={fieldHint}>With or without +263, spaces or dashes.</p>
            </div>
            <button type="submit" aria-disabled={busy}
              className={`${portalButtonPrimaryLarge} w-full ${busy ? 'cursor-wait opacity-80' : ''}`}>
              {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Looking it up</> : 'Track booking'}
            </button>
          </form>
        </PortalSection>

        <div className="min-w-0" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {result.kind === 'found' && (
              <motion.div key={`found-${result.booking.reference}-${result.booking.status}`} {...arrive} exit={leave}>
                <StatusCard booking={result.booking} />
              </motion.div>
            )}
            {result.kind === 'none' && (
              <motion.div key="none" {...arrive} exit={leave}
                className={`${portalCard} flex flex-col items-center gap-2 px-4 py-10 text-center`}>
                <SearchX size={28} className="text-lake-700" aria-hidden />
                <p className="text-lg font-semibold text-lake-950">We couldn't find a booking with those details</p>
                <p className="max-w-md text-base leading-normal text-lake-700">
                  Check the reference on your confirmation, and use the same phone number you gave when you booked.
                </p>
              </motion.div>
            )}
            {result.kind === 'error' && (
              <motion.div key="error" {...arrive} exit={leave} role="alert"
                className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3.5 text-base leading-snug text-red-800">
                <AlertCircle size={20} className="mt-px shrink-0" aria-hidden /> {result.message}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PortalPage>
  );
}

/**
 * The MSC-style status card: the reference and status badge on a navy strip, a
 * one-line summary, the timeline, then the trip as labelled figures.
 */
function StatusCard({ booking: b }: { booking: TrackedBooking }) {
  const ended = b.status === 'declined' || b.status === 'cancelled';
  const reached = ended ? 0 : STEPS.findIndex((s) => s.status === b.status);

  return (
    <article className={`${portalCard} overflow-hidden`} aria-labelledby="track-ref">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-lake-950 px-4 py-3.5 text-white sm:px-5">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-lake-200">Booking reference</p>
          <h2 id="track-ref" className="mt-0.5 select-all break-all font-mono text-xl font-bold tracking-[0.06em]">{b.reference}</h2>
        </div>
        <StatusBadge status={b.status} />
      </header>

      <div className="p-4 sm:p-5">
        <p className="text-base leading-relaxed text-lake-800">{SUMMARY[b.status]}</p>

        <ol aria-label="Booking progress" className="mt-5 grid gap-3 sm:grid-cols-4 sm:gap-2">
          {(ended ? [STEPS[0]] : STEPS).map((step, i) => {
            // A declined or cancelled booking was requested first; that step is done.
            const done = ended || i < reached || b.status === 'completed';
            const current = !ended && i === reached && b.status !== 'completed';
            const Icon = step.icon;
            return (
              <li key={step.status} aria-current={current ? 'step' : undefined}
                className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 ${
                  done ? 'border-emerald-700 bg-emerald-700 text-white'
                    : current ? 'border-lake-950 bg-lake-50 text-lake-950'
                      : 'border-lake-200 bg-white text-lake-700'
                }`}>
                  {done ? <Check size={18} aria-hidden /> : <Icon size={17} aria-hidden />}
                </span>
                <span className={`text-sm leading-snug ${done || current ? 'font-semibold text-lake-950' : 'text-lake-700'}`}>
                  {step.label}
                  <span className="sr-only">{done ? ', done' : current ? ', current step' : ', not yet'}</span>
                </span>
              </li>
            );
          })}
          {ended && (
            <li aria-current="step" className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-red-700 bg-red-50 text-red-700">
                <X size={18} aria-hidden />
              </span>
              <span className="text-sm font-semibold leading-snug text-red-800">
                {b.status === 'declined' ? 'Declined' : 'Cancelled'}
              </span>
            </li>
          )}
        </ol>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-lake-100 pt-4 sm:grid-cols-3">
          <Figure label="Boat" className="col-span-2 sm:col-span-1" valueClassName="text-base font-semibold text-lake-950">
            {b.boatName}
          </Figure>
          {b.boatLocation && (
            <Figure label="Location" className="col-span-2" valueClassName="text-base text-lake-950">
              <span className="inline-flex items-start gap-1.5">
                <MapPin size={15} className="mt-1 shrink-0 text-lake-700" aria-hidden />{b.boatLocation}
              </span>
            </Figure>
          )}
          <Figure label="When" className="col-span-2 sm:col-span-1" valueClassName="text-base tabular-nums text-lake-950">
            {tripWhen(b)}
          </Figure>
          <Figure label="Group" valueClassName="text-base tabular-nums text-lake-950">
            {b.groupSize} guest{b.groupSize > 1 ? 's' : ''}
          </Figure>
          <Figure label="Booked on" valueClassName="text-base tabular-nums text-lake-950">
            {formatDate(b.createdAt)}
          </Figure>
          <Figure label="Trip total"
            valueClassName={`tabular-nums ${b.priceTotal > 0 ? 'text-lg font-bold text-lake-950' : 'text-base text-lake-700'}`}>
            {tripPrice(b)}
          </Figure>
          <Figure label="Deposit" valueClassName="text-base font-semibold tabular-nums text-lake-950">
            ${b.depositAmount}
          </Figure>
        </dl>
      </div>
    </article>
  );
}
