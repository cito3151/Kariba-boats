import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, ShieldCheck, ShieldAlert, Users, LifeBuoy, Phone, TrendingUp, Star, Wallet, BadgeCheck,
  MapPin, Ship, Gauge, Check, Info, CalendarDays, type LucideIcon,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StarRating from '../components/StarRating';
import BookingModal from '../components/BookingModal';
import Reveal from '../components/Reveal';
import AutoCarousel from '../components/AutoCarousel';
import AvailabilityCalendar, { type DateRange } from '../components/AvailabilityCalendar';
import { LoadingState, ErrorState } from '../components/StateViews';
import { BOAT_TYPE_LABELS, priceView, priceLabels } from '../components/BoatCard';
import EmergencyContacts from '../components/EmergencyContacts';
import LakeBackdrop from '../components/LakeBackdrop';
import { portalCard, portalButtonPrimaryLarge } from '../components/portal/styles';
import { reducedFade, revealSpring, riseOnMount } from '../components/motion';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import * as boats from '../services/boats.service';
import type { PublicBoat } from '../services/boats.service';
import * as imagesSvc from '../services/images.service';
import { listBusyPeriodsForBoat } from '../services/bookings.service';
import { listReviewsForBoat } from '../services/reviews.service';
import {
  activeBookingsForBoat, bookingCoversDate, checkRangeSelectable, dayStatus, inclusiveDays, toISODate,
} from '../data/availability';

// A day picked on the calendar travels in the URL (?start=2026-06-12&end=2026-06-14)
// so it survives the round trip through /login and a page refresh.
function validIsoDay(v: string | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d)) === v;
}

// Dropping the range leaves any other query params alone.
function clearRangeParams(params: URLSearchParams): URLSearchParams {
  params.delete('start');
  params.delete('end');
  return params;
}

const GOOD_FOR: Record<string, string[]> = {
  houseboat: ['Overnight stays', 'Families', 'Sightseeing', 'Relaxation'],
  speedboat: ['Day trips', 'Watersports', 'Small groups'],
  fishing: ['Fishing trips', 'Early starts', 'Small groups'],
  cruiser: ['Sunset cruises', 'Celebrations', 'Sightseeing'],
  pontoon: ['Groups', 'Relaxed cruising', 'Families'],
};

// How many of the next free days the booking summary offers as date chips.
const NEXT_DATES = 3;

export default function BoatDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const reduce = useReducedMotion();
  const [showModal, setShowModal] = useState(false);
  // Set when a request goes through. Those days are now the visitor's own booking,
  // so closing the modal would reload them as booked and reject the link as "no
  // longer available", seconds after they booked it. closeModal clears it quietly.
  const justBookedRef = useRef(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: boat, loading, error, reload } = useAsync(
    () => (id ? boats.getPublicBoat(id) : Promise.resolve(null)), [id],
  );
  const { data: imageRows } = useAsync(() => (id ? imagesSvc.listBoatImages(id) : Promise.resolve([])), [id]);
  // Busy periods, not listBookingsForBoat: RLS hides other customers' bookings from a
  // tourist, so a plain table read left this calendar blank for exactly the people
  // who need it. The service falls back to the table read if the function is absent.
  const { data: bookingRows, reload: reloadBookings } = useAsync(
    () => (id ? listBusyPeriodsForBoat(id) : Promise.resolve([])), [id],
  );
  const { data: reviews } = useAsync(() => (id ? listReviewsForBoat(id) : Promise.resolve([])), [id]);

  // Date selection. A boat with no usable rate ("On request") has nothing to price a
  // range against, so it keeps the read-only calendar. Hourly-only boats pick one date.
  // This sits above the early returns because the cleanup effect below is a hook and
  // has to run on every render; until the boat loads, selection is simply off.
  const price = boat ? priceView(boat) : null;
  const calendarBoat = { id: boat?.id ?? '', priceUnit: (price?.unit ?? 'day') as 'hour' | 'day' };
  const calendarBookings = bookingRows ?? [];
  const selectionEnabled = price !== null;
  const singleDate = calendarBoat.priceUnit === 'hour';
  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  let range: DateRange | null = null;
  let rangeDropped = false;
  if (selectionEnabled && urlStart) {
    const end = singleDate ? urlStart : validIsoDay(urlEnd) ? urlEnd : null;
    // Re-checked against the live bookings, so a stale or hand-edited link cannot
    // select a past or booked day.
    const check = validIsoDay(urlStart)
      ? checkRangeSelectable(calendarBoat, calendarBookings, urlStart, end ?? urlStart, toISODate(new Date()))
      : { ok: false };
    if (check.ok) range = { start: urlStart, end };
    else rangeDropped = true;
  }

  // A rejected range is taken out of the address bar, so a refresh or a shared copy of
  // the link does not repeat the bad state. `replace` keeps it out of history, and the
  // boat id is remembered so the message below outlives the params it was about, once.
  const [staleLinkBoatId, setStaleLinkBoatId] = useState<string | null>(null);
  useEffect(() => {
    if (!rangeDropped) return;
    setStaleLinkBoatId(calendarBoat.id);
    setSearchParams((prev) => clearRangeParams(new URLSearchParams(prev)), { replace: true });
  }, [rangeDropped, calendarBoat.id, setSearchParams]);

  if (loading) return <PageTransition><div className="mx-auto max-w-6xl px-4 py-10"><LoadingState label="Loading boat" /></div></PageTransition>;
  if (error) return <PageTransition><div className="mx-auto max-w-6xl px-4 py-10"><ErrorState message={error} onRetry={reload} /></div></PageTransition>;
  if (!boat) return <PageTransition><div className="mx-auto max-w-6xl px-4 py-10"><ErrorState message="This boat is not available." /></div></PageTransition>;

  const rates = priceLabels(boat);
  const sorted = [...(imageRows ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const galleryImages = sorted.length
    ? sorted.map((i) => imagesSvc.publicImageUrl(i.storagePath))
    : [`illustration:${boat.boatType}`];

  const reviewList = reviews ?? [];
  const avgRating = reviewList.length
    ? reviewList.reduce((s, r) => s + r.rating, 0) / reviewList.length
    : null;
  const goodFor = GOOD_FOR[boat.boatType] ?? [];
  const descLong = boat.description.length > 320;
  const descShown = descLong && !descExpanded ? `${boat.description.slice(0, 320).trimEnd()}...` : boat.description;

  const handleRangeChange = (next: DateRange | null) => {
    setStaleLinkBoatId(null);
    setSearchParams((prev) => {
      const params = clearRangeParams(new URLSearchParams(prev));
      if (next) {
        params.set('start', next.start);
        if (next.end) params.set('end', next.end);
      }
      return params;
    }, { replace: true });
  };

  const handleBookClick = () => {
    if (!currentUser) {
      // Login returns here via state.from, which keeps the query string and so the
      // selected dates. The modal does not reopen by itself; they press the button again.
      const query = range ? `?start=${range.start}${range.end ? `&end=${range.end}` : ''}` : '';
      navigate('/login', { state: { from: `/boats/${boat.id}${query}` } });
      return;
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    if (justBookedRef.current) {
      justBookedRef.current = false;
      setSearchParams((prev) => clearRangeParams(new URLSearchParams(prev)), { replace: true });
    }
    // A request sent from the modal now holds its days; refresh so the calendar shows it.
    reloadBookings();
  };

  // The next few days that can still be picked, as MSC lists a deal's departure
  // dates: tapping one does exactly what tapping that day on the calendar does
  // first (handleRangeChange), so the calendar, the URL and the modal all follow.
  const upcoming: string[] = [];
  if (selectionEnabled) {
    const active = activeBookingsForBoat(calendarBookings, boat.id);
    const now = new Date();
    for (let i = 0; i < 60 && upcoming.length < NEXT_DATES; i++) {
      const iso = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
      if (dayStatus(calendarBoat, active.filter((b) => bookingCoversDate(b, iso))) !== 'booked') upcoming.push(iso);
    }
  }
  const pickDate = (iso: string) => {
    if (range?.start === iso) handleRangeChange(null);
    else handleRangeChange(singleDate ? { start: iso, end: iso } : { start: iso, end: null });
  };
  const datesText = range ? describeRange(range, singleDate) : null;
  const scrollToCalendar = () => {
    document.getElementById('availability')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const priceBlock = <PriceBlock boat={boat} price={price} rates={rates} />;
  const datesBlock = (
    <>
      {datesText && (
        <div className="mt-5 rounded-lg bg-lake-50 px-4 py-3">
          <p className="text-sm font-semibold uppercase tracking-[0.05em] text-lake-700">Your dates</p>
          <p className="mt-0.5 text-base font-bold text-lake-950">{datesText}</p>
        </div>
      )}
      {upcoming.length > 0 && (
        <NextFreeDates dates={upcoming} picked={range?.start ?? null} onPick={pickDate} onSeeAll={scrollToCalendar} />
      )}
    </>
  );
  const loginNote = !currentUser && (
    <p className="mt-3 text-center text-sm leading-snug text-lake-700">
      You will need to log in or create a free account to send a booking request.
    </p>
  );

  return (
    <PageTransition>
      {/* The pale page background is layered (LakeBackdrop), never a flat fill.
          No overflow clipping on this wrapper: the phone's booking bar at its foot
          is sticky, and sticky stops working inside a clipped box. */}
      <div className="relative isolate">
        <LakeBackdrop />
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 sm:pt-6 lg:pb-20">
          <Link to="/"
            className="-ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-[15px] font-semibold text-lake-800 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
            <ArrowLeft size={18} aria-hidden /> Back to search
          </Link>

          <BoatHero
            boat={boat}
            images={galleryImages}
            hasPhotos={sorted.length > 0}
            unit={price?.unit ?? null}
            avgRating={avgRating}
            reviewCount={reviewList.length}
          />

          <div className="mt-6 grid grid-cols-1 gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
            <div className="min-w-0 space-y-6">
              {/* The deal card: where it leaves from, who runs it, what it is. */}
              <Reveal className={`${portalCard} p-5 sm:p-7`}>
                <p className="flex items-start gap-2.5 text-base leading-snug text-lake-950 sm:text-[17px]">
                  <MapPin size={20} className="mt-px shrink-0 text-lake-700" aria-hidden />
                  <span>
                    <span className="font-extrabold uppercase tracking-[0.05em]">Departs from:</span>{' '}
                    {boat.location}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="flex items-center gap-2.5 text-base text-lake-950 sm:text-[17px]">
                    <Ship size={20} className="shrink-0 text-lake-700" aria-hidden />
                    <span>Operated by <span className="font-bold">{boat.operatorName || 'Kariba operator'}</span></span>
                  </p>
                  {boat.operatorVerified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-sm bg-lake-950 px-2.5 py-1 text-[13px] font-bold uppercase tracking-[0.06em] text-white">
                      <ShieldCheck size={14} aria-hidden /> Verified operator
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-sm bg-amber-100 px-2.5 py-1 text-[13px] font-bold uppercase tracking-[0.06em] text-amber-900">
                      <ShieldAlert size={14} aria-hidden /> Verification pending
                    </span>
                  )}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[30px] text-[15px] text-lake-800">
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp size={16} className="text-emerald-700" aria-hidden />
                    Trust score <span className="font-bold tabular-nums text-lake-950">{boat.operatorTrustScore}</span>
                  </span>
                  {boat.operatorPhone && (
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Phone size={16} className="text-lake-700" aria-hidden /> {boat.operatorPhone}
                    </span>
                  )}
                </p>

                <div className="mt-5 border-t border-lake-100 pt-5">
                  <p className="whitespace-pre-wrap text-base leading-relaxed text-lake-800 sm:text-[17px]">{descShown}</p>
                  {descLong && (
                    <button onClick={() => setDescExpanded((v) => !v)}
                      className="mt-1 min-h-10 rounded-md text-base font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
                      {descExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>

                <ul className="mt-4 flex flex-wrap gap-2">
                  <li className="inline-flex items-center gap-1.5 rounded-full border border-lake-200 bg-white px-3 py-1.5 text-sm font-semibold text-lake-800">
                    <LifeBuoy size={15} className="text-lake-700" aria-hidden /> {boat.crewIncluded ? 'Captain included' : 'Self-drive'}
                  </li>
                  <li className="inline-flex items-center gap-1.5 rounded-full border border-lake-200 bg-white px-3 py-1.5 text-sm font-semibold text-lake-800">
                    <Wallet size={15} className="text-lake-700" aria-hidden /> {boat.depositPercent}% deposit to confirm
                  </li>
                  <li className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
                    <BadgeCheck size={15} aria-hidden /> Free to request, pay nothing until confirmed
                  </li>
                </ul>

                {goodFor.length > 0 && (
                  <div className="mt-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.05em] text-lake-700">Great for</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {goodFor.map((g) => (
                        <li key={g} className="rounded-full bg-lake-50 px-3 py-1.5 text-sm font-medium text-lake-800">{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Reveal>

              {/* On a phone the price block sits in the flow, as on an MSC deal card;
                  its button lives in the bar at the foot of the screen. */}
              <Reveal className={`${portalCard} p-5 lg:hidden`}>
                {priceBlock}
                {datesBlock}
                {loginNote}
              </Reveal>

              <Reveal className={`${portalCard} p-5 sm:p-7`}>
                <SectionTitle>Key facts</SectionTitle>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                  <Fact icon={Users} label="Capacity">
                    Up to <span className="tabular-nums">{boat.capacity}</span>
                    <span className="text-base font-semibold text-lake-800"> {boat.capacity === 1 ? 'guest' : 'guests'}</span>
                  </Fact>
                  <Fact icon={LifeBuoy} label="Crew">{boat.crewIncluded ? 'Captain included' : 'Self-drive'}</Fact>
                  <Fact icon={Ship} label="Boat type">{BOAT_TYPE_LABELS[boat.boatType]}</Fact>
                  <Fact icon={Wallet} label="Deposit"><span className="tabular-nums">{boat.depositPercent}%</span></Fact>
                  <Fact icon={Gauge} label="Trust score">
                    <span className="tabular-nums">{boat.operatorTrustScore}</span>
                    <span className="text-base font-semibold text-lake-800">/100</span>
                  </Fact>
                  <Fact icon={ShieldCheck} label="Registration">{boat.registrationNumber || 'On file'}</Fact>
                </dl>
              </Reveal>

              <Reveal className={`${portalCard} p-5 sm:p-7`}>
                <SectionTitle>On board</SectionTitle>
                <div className="mt-5 grid gap-6 sm:grid-cols-2">
                  {boat.facilities.length > 0 && (
                    <div>
                      <h3 className="text-base font-extrabold uppercase tracking-[0.05em] text-lake-950">Facilities</h3>
                      <ul className="mt-3 space-y-2 text-base text-lake-800">
                        {boat.facilities.map((a) => (
                          <li key={a} className="flex items-start gap-2.5">
                            <Check size={18} className="mt-0.5 shrink-0 text-lake-700" aria-hidden /> {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-extrabold uppercase tracking-[0.05em] text-lake-950">
                      <LifeBuoy size={18} className="text-sunset-700" aria-hidden /> Safety checklist
                    </h3>
                    {boat.safetyEquipment.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-base text-lake-800">
                        {boat.safetyEquipment.map((s) => (
                          <li key={s} className="flex items-start gap-2.5">
                            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden /> {s}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-base text-lake-800">Safety equipment details confirmed with the operator on booking.</p>
                    )}
                  </div>
                </div>
                {boat.operatorPhone && (
                  <p className="mt-5 border-t border-lake-100 pt-4 text-sm leading-relaxed text-lake-700">
                    Emergency contact: Kariba Marine Police +263 61 2 2XXX · Operator on-call: {boat.operatorPhone}
                  </p>
                )}
              </Reveal>

              <EmergencyContacts compact />

              {/* scroll-mt clears the sticky site header when "All dates" jumps here. */}
              <Reveal id="availability" className="scroll-mt-24">
                <AvailabilityCalendar
                  boat={calendarBoat}
                  bookings={calendarBookings}
                  selectedRange={range}
                  onRangeChange={selectionEnabled ? handleRangeChange : undefined}
                />
                {(rangeDropped || staleLinkBoatId === boat.id) && (
                  <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-900">
                    The dates in your link are no longer available. Pick new ones above.
                  </p>
                )}
                <p className="mt-3 px-1 text-sm leading-relaxed text-lake-800">
                  {selectionEnabled
                    ? 'Your dates carry into the booking form. Requested bookings hold their slot until the operator responds.'
                    : 'Tap a date to see booked times and free slots. Requested bookings hold their slot until the operator responds.'}
                </p>
              </Reveal>

              <Reveal className={`${portalCard} p-5 sm:p-7`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <SectionTitle>Reviews</SectionTitle>
                  {avgRating != null && (
                    <p className="inline-flex items-center gap-1.5 pb-0.5 text-base text-lake-800">
                      <Star size={18} className="fill-sunset-500 text-sunset-500" aria-hidden />
                      <span className="text-xl font-extrabold tabular-nums text-lake-950">{avgRating.toFixed(1)}</span>
                      <span className="tabular-nums">({reviewList.length} review{reviewList.length !== 1 ? 's' : ''})</span>
                    </p>
                  )}
                </div>
                {reviewList.length === 0 ? (
                  <p className="mt-4 text-base text-lake-800">No reviews yet. Guests can review a trip once it is completed.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-lake-100">
                    {reviewList.map((r) => (
                      <Reveal as="li" key={r.id} y={12} className="py-4 first:pt-1 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-base font-bold text-lake-950">{r.touristName}</span>
                          <StarRating rating={r.rating} size={16} showNumber={false} />
                        </div>
                        {r.comment && <p className="mt-1.5 text-base leading-relaxed text-lake-800">{r.comment}</p>}
                        {r.operatorResponse && (
                          <p className="mt-3 rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] leading-relaxed text-lake-800">
                            <span className="font-bold text-lake-950">Operator: </span>{r.operatorResponse}
                          </p>
                        )}
                        <p className="mt-2 text-sm tabular-nums text-lake-700">{r.createdAt.slice(0, 10)}</p>
                      </Reveal>
                    ))}
                  </ul>
                )}
              </Reveal>
            </div>

            {/* Wide screens: the booking summary rides beside the content. */}
            <aside className="hidden lg:sticky lg:top-24 lg:block">
              {/* Never taller than the screen: on a short laptop the details scroll
                  inside the card and the button stays in view at its foot. */}
              <motion.div {...riseOnMount(reduce, 0.15)}
                className={`${portalCard} flex max-h-[calc(100svh-7rem)] flex-col`}>
                <div className="min-h-0 overflow-y-auto p-6 pb-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.06em] text-lake-700">Booking summary</p>
                  <div className="mt-3">{priceBlock}</div>
                  {datesBlock}
                </div>
                <div className="border-t border-lake-100 px-6 pb-6 pt-5">
                  <button type="button" onClick={handleBookClick} className={`${portalButtonPrimaryLarge} w-full`}>
                    Book this boat
                  </button>
                  {loginNote}
                </div>
              </motion.div>
            </aside>
          </div>
        </div>

        {/* Phones: the price and the one orange button stay at the foot of the
            screen while the page scrolls. Sticky inside this wrapper, so it rests
            above the site footer instead of covering it. */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { y: '100%' }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          transition={reduce ? reducedFade : { ...revealSpring, delay: 0.3 }}
          className="sticky bottom-0 z-20 border-t border-lake-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgb(13_37_50/0.10)] backdrop-blur-md lg:hidden"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              {price ? (
                <p className="leading-none text-lake-950">
                  <span className="text-[28px] font-extrabold tabular-nums">${price.amount}</span>
                  <span className="ml-1 text-sm font-semibold text-lake-800">per {price.unit}</span>
                </p>
              ) : (
                <p className="text-xl font-extrabold text-lake-950">On request</p>
              )}
              <p className="mt-1 truncate text-sm text-lake-700">
                {datesText ?? `${boat.depositPercent}% deposit to confirm`}
              </p>
            </div>
            <button type="button" onClick={handleBookClick} className={`${portalButtonPrimaryLarge} shrink-0`}>
              Book this boat
            </button>
          </div>
        </motion.div>
      </div>

      {showModal && (
        <BookingModal
          boat={boat}
          touristId={currentUser?.id ?? null}
          // Trimmed: profile names can carry stray whitespace into the form.
          initialName={currentUser?.name?.trim()}
          initialPhone={currentUser?.phone ?? undefined}
          initialStartDate={range?.start}
          initialEndDate={singleDate ? undefined : range?.end ?? undefined}
          onClose={closeModal}
          onBooked={() => { justBookedRef.current = true; }}
        />
      )}
    </PageTransition>
  );
}

/** "Fri 12 Jun", or "Fri 12 Jun 2027" outside the current year. */
function shortDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** The picked dates in a line, for the booking summary and the phone's bar. */
function describeRange(range: DateRange, singleDate: boolean) {
  if (singleDate || range.end === range.start) return shortDay(range.start);
  if (range.end === null) return `From ${shortDay(range.start)}, choose an end day`;
  const n = inclusiveDays(range.start, range.end);
  return `${shortDay(range.start)} to ${shortDay(range.end)} · ${n} days`;
}

/**
 * The boat's own photos as the page header, with a dark wash at the foot and the
 * boat's type, hire basis and name set large in white on it. The slideshow
 * drifts a little slower than the page as it scrolls away (parallax "top"), and
 * the frame settles in on load; under reduced motion both are still.
 */
function BoatHero({
  boat, images, hasPhotos, unit, avgRating, reviewCount,
}: {
  boat: PublicBoat;
  images: string[];
  hasPhotos: boolean;
  unit: 'hour' | 'day' | null;
  avgRating: number | null;
  reviewCount: number;
}) {
  const reduce = useReducedMotion();
  const chip = 'rounded-sm bg-white px-2.5 py-1 text-[13px] font-bold uppercase leading-none tracking-[0.06em] text-lake-950';

  return (
    <motion.header
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? reducedFade : { type: 'spring', bounce: 0, duration: 0.8 }}
      className="group relative mt-3 h-[340px] overflow-hidden rounded-xl bg-lake-900 shadow-[0_10px_30px_rgb(13_37_50/0.18)] sm:h-[440px] lg:h-[480px]"
    >
      <AutoCarousel images={images} alt={boat.name} className="h-full w-full" intervalMs={5000}
        showArrows showDots parallax="top" />
      {/* lake-950, not black, so the wash reads as part of the palette. Under the
          arrows and dots (z-10) so they stay usable. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] bg-linear-to-t from-lake-950/90 via-lake-950/30 to-transparent" />
      {!hasPhotos && (
        <span className="pointer-events-none absolute left-4 top-4 z-10 rounded-sm bg-white/95 px-2.5 py-1 text-[13px] font-semibold text-lake-950">
          Illustration, real photos pending
        </span>
      )}
      <motion.div {...riseOnMount(reduce, 0.2, 16)}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-9 sm:px-8 sm:pb-11">
        <div className="flex flex-wrap gap-2">
          <span className={chip}>{BOAT_TYPE_LABELS[boat.boatType]}</span>
          {unit && <span className={chip}>{unit === 'hour' ? 'Hourly hire' : 'Day hire'}</span>}
        </div>
        <h1 className="mt-3 max-w-3xl text-balance text-[32px] font-extrabold leading-[1.05] text-white [text-shadow:0_1px_12px_rgb(13_37_50/0.35)] sm:text-[40px]">
          {boat.name}
        </h1>
        {avgRating != null && (
          <p className="mt-2 flex items-center gap-1.5 text-base text-white">
            <Star size={18} className="fill-sunset-400 text-sunset-400" aria-hidden />
            <span className="font-bold tabular-nums">{avgRating.toFixed(1)}</span>
            <span className="tabular-nums">({reviewCount} review{reviewCount !== 1 ? 's' : ''})</span>
          </p>
        )}
      </motion.div>
    </motion.header>
  );
}

/** A section title in the page's grammar: a short orange rule over an uppercase heading. */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span aria-hidden className="block h-1 w-10 rounded-full bg-sunset-500" />
      <h2 className="mt-3 text-xl font-extrabold uppercase tracking-[0.04em] text-lake-950 sm:text-2xl">{children}</h2>
    </div>
  );
}

/** One labelled figure in the Key facts list: a small uppercase label over a large value. */
function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l-2 border-lake-100 pl-3">
      <dt className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.05em] text-lake-700">
        <Icon size={16} aria-hidden /> {label}
      </dt>
      <dd className="mt-1 break-words text-xl font-bold leading-snug text-lake-950">{children}</dd>
    </div>
  );
}

/**
 * The price block of the booking summary, laid out like a cruise deal's: the
 * label on the left, the headline rate large on the right with its unit, any
 * other rate beneath, then what the price covers and the deposit. The rates are
 * priceView and priceLabels, exactly as the cards show them.
 */
function PriceBlock({
  boat, price, rates,
}: {
  boat: PublicBoat;
  price: { amount: number; unit: 'hour' | 'day' } | null;
  rates: { amount: number; unit: 'hour' | 'day' }[];
}) {
  const others = rates.filter((r) => r.unit !== price?.unit);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 pb-1 text-[15px] font-semibold text-lake-800">
          <Info size={16} className="text-lake-700" aria-hidden /> {price ? 'Boat hire from' : 'Price'}
        </p>
        {price ? (
          <p className="leading-none text-lake-950">
            <span className="text-[34px] font-extrabold tabular-nums">${price.amount}</span>
            <span className="ml-1 text-base font-semibold text-lake-800">per {price.unit}</span>
          </p>
        ) : (
          <p className="text-[28px] font-extrabold leading-none text-lake-950">On request</p>
        )}
      </div>
      {others.map((r) => (
        <p key={r.unit} className="mt-1.5 text-right text-[15px] text-lake-800">
          or <span className="font-bold tabular-nums text-lake-950">${r.amount}</span> per {r.unit}
        </p>
      ))}
      <ul className="mt-4 space-y-2 border-t border-lake-100 pt-4 text-[15px] leading-snug text-lake-800">
        <li className="flex items-start gap-2.5">
          <Users size={17} className="mt-px shrink-0 text-lake-700" aria-hidden />
          <span>The whole boat, for up to <span className="font-semibold tabular-nums text-lake-950">{boat.capacity}</span> {boat.capacity === 1 ? 'guest' : 'guests'}</span>
        </li>
        <li className="flex items-start gap-2.5">
          <LifeBuoy size={17} className="mt-px shrink-0 text-lake-700" aria-hidden />
          <span>{boat.crewIncluded ? 'Captain included' : 'Self-drive, no captain'}</span>
        </li>
        <li className="flex items-start gap-2.5">
          <Wallet size={17} className="mt-px shrink-0 text-lake-700" aria-hidden />
          <span><span className="font-semibold tabular-nums text-lake-950">{boat.depositPercent}%</span> deposit to confirm, balance paid on the day</span>
        </li>
        <li className="flex items-start gap-2.5">
          <BadgeCheck size={17} className="mt-px shrink-0 text-emerald-700" aria-hidden />
          <span>Free to request, pay nothing until confirmed</span>
        </li>
      </ul>
    </div>
  );
}

/**
 * The next free days as stacked date chips (weekday, day and month, year). Each
 * gives under the finger as it is pressed; the picked one takes the calendar's
 * start-day colour.
 */
function NextFreeDates({
  dates, picked, onPick, onSeeAll,
}: {
  dates: string[];
  picked: string | null;
  onPick: (iso: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.05em] text-lake-700">Next free dates</p>
        <button type="button" onClick={onSeeAll}
          className="inline-flex min-h-8 items-center gap-1 rounded-md text-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
          <CalendarDays size={15} aria-hidden /> All dates
        </button>
      </div>
      <ul className="mt-2.5 grid grid-cols-3 gap-2">
        {dates.map((iso) => {
          const [y, m, d] = iso.split('-').map(Number);
          const day = new Date(y, m - 1, d);
          const on = picked === iso;
          return (
            <li key={iso}>
              <button type="button" aria-pressed={on} onClick={() => onPick(iso)}
                className={`flex min-h-[76px] w-full flex-col items-center justify-center rounded-lg border px-1 py-2 text-center outline-none transition-[background-color,border-color,color,scale] duration-150 active:scale-[0.95] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-lake-800 focus-visible:ring-offset-2 ${
                  on ? 'border-sunset-700 bg-sunset-700 text-white' : 'border-lake-100 bg-lake-50 text-lake-950 hover:border-lake-400 hover:bg-white'
                }`}>
                <span className={`text-[13px] font-semibold uppercase tracking-[0.05em] ${on ? 'text-white' : 'text-lake-700'}`}>
                  {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span className="text-base font-extrabold leading-tight tabular-nums">
                  {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <span className={`text-[13px] tabular-nums ${on ? 'text-white' : 'text-lake-700'}`}>{y}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
