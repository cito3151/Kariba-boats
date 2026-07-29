import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, ShieldAlert, Users, LifeBuoy, Phone, TrendingUp, Star, Wallet, BadgeCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StarRating from '../components/StarRating';
import BookingModal from '../components/BookingModal';
import Reveal from '../components/Reveal';
import AutoCarousel from '../components/AutoCarousel';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { LoadingState, ErrorState } from '../components/StateViews';
import { BOAT_TYPE_LABELS, priceView, priceLabels } from '../components/BoatCard';
import EmergencyContacts from '../components/EmergencyContacts';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import * as boats from '../services/boats.service';
import * as imagesSvc from '../services/images.service';
import { listBookingsForBoat } from '../services/bookings.service';
import { listReviewsForBoat } from '../services/reviews.service';
import type { Booking } from '../data/availability';

const GOOD_FOR: Record<string, string[]> = {
  houseboat: ['Overnight stays', 'Families', 'Sightseeing', 'Relaxation'],
  speedboat: ['Day trips', 'Watersports', 'Small groups'],
  fishing: ['Fishing trips', 'Early starts', 'Small groups'],
  cruiser: ['Sunset cruises', 'Celebrations', 'Sightseeing'],
  pontoon: ['Groups', 'Relaxed cruising', 'Families'],
};

export default function BoatDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const { data: boat, loading, error, reload } = useAsync(
    () => (id ? boats.getPublicBoat(id) : Promise.resolve(null)), [id],
  );
  const { data: imageRows } = useAsync(() => (id ? imagesSvc.listBoatImages(id) : Promise.resolve([])), [id]);
  const { data: bookingRows } = useAsync(() => (id ? listBookingsForBoat(id) : Promise.resolve([])), [id]);
  const { data: reviews } = useAsync(() => (id ? listReviewsForBoat(id) : Promise.resolve([])), [id]);

  if (loading) return <PageTransition><div className="mx-auto max-w-6xl px-4 py-10"><LoadingState label="Loading boat" /></div></PageTransition>;
  if (error) return <PageTransition><div className="mx-auto max-w-6xl px-4 py-10"><ErrorState message={error} onRetry={reload} /></div></PageTransition>;
  if (!boat) return <PageTransition><div className="mx-auto max-w-6xl px-4 py-10"><ErrorState message="This boat is not available." /></div></PageTransition>;

  const price = priceView(boat);
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

  const calendarBoat = { id: boat.id, priceUnit: (price?.unit ?? 'day') as 'hour' | 'day' };
  const calendarBookings: Booking[] = (bookingRows ?? []).map((b) => ({
    id: b.id, boatId: b.boatId, status: b.status, date: b.startDate, days: b.days,
    startTime: b.startTime, durationHours: b.durationHours, touristName: b.guestName,
  }));

  const handleBookClick = () => {
    if (!currentUser) {
      navigate('/login', { state: { from: `/boats/${boat.id}` } });
      return;
    }
    setShowModal(true);
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-lake-500 hover:text-lake-800">
          <ArrowLeft size={16} /> Back to search
        </Link>

        <motion.div initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }} className="group mt-4 rounded-2xl">
          <AutoCarousel images={galleryImages} alt={boat.name} className="h-72 sm:h-96 rounded-2xl" intervalMs={4500} showArrows showDots />
        </motion.div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              {boat.operatorVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-lake-100 px-2.5 py-1 text-xs font-semibold text-lake-700">
                  <ShieldCheck size={13} /> Verified operator
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  <ShieldAlert size={13} /> Verification pending
                </span>
              )}
              <span className="rounded-full bg-lake-50 border border-lake-100 px-3 py-1 text-xs text-lake-700">
                {BOAT_TYPE_LABELS[boat.boatType]}
              </span>
            </div>

            <h1 className="mt-3 text-3xl sm:text-4xl font-medium text-lake-950">{boat.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-lake-500">
              {avgRating != null && (
                <span className="inline-flex items-center gap-1 font-medium text-lake-800">
                  <Star size={14} className="fill-sunset-400 text-sunset-400" />
                  {avgRating.toFixed(1)}
                  <span className="font-normal text-lake-500">({reviewList.length} review{reviewList.length !== 1 ? 's' : ''})</span>
                </span>
              )}
              {avgRating != null && <span aria-hidden>·</span>}
              <span>{boat.location}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-lake-100 bg-white px-3 py-1.5 text-xs font-medium text-lake-700">
                <LifeBuoy size={13} className="text-lake-500" /> {boat.crewIncluded ? 'Captain included' : 'Self-drive'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-lake-100 bg-white px-3 py-1.5 text-xs font-medium text-lake-700">
                <Wallet size={13} className="text-lake-500" /> {boat.depositPercent}% deposit to confirm
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                <BadgeCheck size={13} /> Free to request, pay nothing until confirmed
              </span>
            </div>

            {goodFor.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-lake-400">Great for</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {goodFor.map((g) => (
                    <span key={g} className="rounded-full bg-lake-50 px-3 py-1 text-xs text-lake-700">{g}</span>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-lake-700">{descShown}</p>
            {descLong && (
              <button onClick={() => setDescExpanded((v) => !v)}
                className="mt-1 text-sm font-semibold text-lake-700 hover:text-lake-900">
                {descExpanded ? 'Show less' : 'Read more'}
              </button>
            )}

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-lake-50 p-3 text-center">
                <Users size={16} className="mx-auto text-lake-500" />
                <p className="mt-1 font-semibold">{boat.capacity}</p>
                <p className="text-xs text-lake-500">Capacity</p>
              </div>
              <div className="rounded-xl bg-lake-50 p-3 text-center">
                <LifeBuoy size={16} className="mx-auto text-lake-500" />
                <p className="mt-1 font-semibold">{boat.crewIncluded ? 'Included' : 'Self-drive'}</p>
                <p className="text-xs text-lake-500">Crew</p>
              </div>
              <div className="rounded-xl bg-lake-50 p-3 text-center">
                <ShieldCheck size={16} className="mx-auto text-lake-500" />
                <p className="mt-1 font-semibold">{boat.registrationNumber || 'On file'}</p>
                <p className="text-xs text-lake-500">Registration</p>
              </div>
            </div>

            {boat.facilities.length > 0 && (
              <Reveal className="mt-6">
                <h3 className="font-display text-lg font-medium text-lake-950">Facilities and amenities</h3>
                <ul className="mt-2 grid grid-cols-2 gap-2 text-sm text-lake-700">
                  {boat.facilities.map((a) => (
                    <li key={a} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-lake-400" /> {a}</li>
                  ))}
                </ul>
              </Reveal>
            )}

            <Reveal className="mt-6 rounded-xl border border-lake-100 p-4">
              <h3 className="font-display text-lg font-medium text-lake-950 flex items-center gap-2">
                <LifeBuoy size={16} className="text-lake-600" /> Safety checklist
              </h3>
              {boat.safetyEquipment.length > 0 ? (
                <ul className="mt-2 grid grid-cols-2 gap-2 text-sm text-lake-700">
                  {boat.safetyEquipment.map((s) => (
                    <li key={s} className="flex items-center gap-2"><ShieldCheck size={13} className="text-emerald-500" /> {s}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-lake-500">Safety equipment details confirmed with the operator on booking.</p>
              )}
              {boat.operatorPhone && (
                <p className="mt-3 text-xs text-lake-500">
                  Emergency contact: Kariba Marine Police +263 61 2 2XXX · Operator on-call: {boat.operatorPhone}
                </p>
              )}
            </Reveal>

            <Reveal className="mt-6">
              <AvailabilityCalendar boat={calendarBoat} bookings={calendarBookings} />
              <p className="mt-2 text-xs text-lake-400">
                Tap a date to see booked times and free slots. Requested bookings hold their slot until the operator responds.
              </p>
            </Reveal>

            <div className="mt-8">
              <h3 className="flex items-center gap-2 font-display text-lg font-medium text-lake-950">
                Reviews
                {avgRating != null && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-lake-600">
                    <Star size={14} className="fill-sunset-400 text-sunset-400" /> {avgRating.toFixed(1)} ({reviewList.length})
                  </span>
                )}
              </h3>
              <div className="mt-3 space-y-3">
                {reviewList.length === 0 && (
                  <p className="text-sm text-lake-500">No reviews yet. Guests can review a trip once it is completed.</p>
                )}
                {reviewList.map((r) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }} className="rounded-xl border border-lake-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-lake-900">{r.touristName}</span>
                      <StarRating rating={r.rating} size={12} showNumber={false} />
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-lake-600">{r.comment}</p>}
                    {r.operatorResponse && (
                      <p className="mt-2 rounded-lg bg-lake-50 px-2 py-1 text-xs text-lake-600">
                        <span className="font-semibold">Operator: </span>{r.operatorResponse}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-lake-400">{r.createdAt.slice(0, 10)}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
              className="sticky top-24 rounded-2xl border border-lake-100 p-5 shadow-sm bg-white">
              {avgRating != null && (
                <div className="mb-3 flex items-center gap-1 text-sm font-medium text-lake-800">
                  <Star size={15} className="fill-sunset-400 text-sunset-400" />
                  {avgRating.toFixed(1)}
                  <span className="font-normal text-lake-500">· {reviewList.length} review{reviewList.length !== 1 ? 's' : ''}</span>
                </div>
              )}
              {rates.length > 0 ? (
                <div className="space-y-1">
                  {rates.map((r) => (
                    <div key={r.unit} className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold text-lake-950">${r.amount}</span>
                      <span className="text-sm text-lake-500">per {r.unit}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-2xl font-bold text-lake-950">On request</span>
              )}

              <button onClick={handleBookClick}
                className="mt-4 w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 transition-colors">
                Request to book
              </button>
              <p className="mt-2 text-center text-[11px] text-lake-400">{boat.depositPercent}% deposit to confirm · balance paid on the day</p>
              {!currentUser && (
                <p className="mt-2 text-center text-[11px] text-lake-400">
                  You will need to log in or create a free account to send a booking request.
                </p>
              )}

              <div className="mt-5 border-t border-lake-100 pt-4">
                <p className="text-xs font-medium text-lake-500 uppercase tracking-wide">Operated by</p>
                <p className="mt-1 font-semibold text-lake-950">{boat.operatorName || 'Kariba operator'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-lake-600">
                  <span className="inline-flex items-center gap-1"><TrendingUp size={13} className="text-emerald-500" /> Trust {boat.operatorTrustScore}</span>
                  <span className="inline-flex items-center gap-1"><LifeBuoy size={13} className="text-lake-500" /> {boat.crewIncluded ? 'Captain included' : 'Self-drive'}</span>
                  {boat.operatorPhone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {boat.operatorPhone}</span>}
                </div>
              </div>
            </motion.div>

            <div className="mt-4"><EmergencyContacts compact /></div>
          </div>
        </div>
      </div>

      {showModal && (
        <BookingModal
          boat={boat}
          touristId={currentUser?.id ?? null}
          initialName={currentUser?.name}
          initialPhone={currentUser?.phone ?? undefined}
          onClose={() => setShowModal(false)}
        />
      )}
    </PageTransition>
  );
}
