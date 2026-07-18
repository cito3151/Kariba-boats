import { useState } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Users,
  LifeBuoy,
  Phone,
  Clock,
  TrendingUp,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StarRating from '../components/StarRating';
import BookingModal from '../components/BookingModal';
import ReviewForm from '../components/ReviewForm';
import Reveal from '../components/Reveal';
import AutoCarousel from '../components/AutoCarousel';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { useAppData } from '../data/AppDataContext';
import { useAuth } from '../data/AuthContext';
import { experienceLabels } from '../data/mockData';

export default function BoatDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getBoat, getOperator, reviews, bookings } = useAppData();
  const { currentUser } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const boat = id ? getBoat(id) : undefined;
  if (!boat) return <Navigate to="/" replace />;
  const operator = getOperator(boat.operatorId);
  const boatReviews = reviews.filter((r) => r.boatId === boat.id);

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

        {/* Gallery */}
        <motion.div
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="group mt-4 rounded-2xl"
        >
          <AutoCarousel
            images={boat.images}
            alt={boat.name}
            className="h-72 sm:h-96 rounded-2xl"
            intervalMs={4500}
            showArrows
            showDots
          />
        </motion.div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              {boat.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-lake-100 px-2.5 py-1 text-xs font-semibold text-lake-700">
                  <ShieldCheck size={13} /> Verified operator
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  <ShieldAlert size={13} /> Pending verification
                </span>
              )}
              {boat.availableToday && (
                <span className="rounded-full bg-sunset-100 px-2.5 py-1 text-xs font-semibold text-sunset-700">
                  Available today
                </span>
              )}
            </div>

            <h1 className="mt-3 text-3xl sm:text-4xl font-medium text-lake-950">{boat.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-lake-500">
              <StarRating rating={boat.rating} />
              <span>{boat.reviewCount} reviews</span>
              <span>·</span>
              <span>{boat.location}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {boat.experiences.map((e) => (
                <span key={e} className="rounded-full bg-lake-50 border border-lake-100 px-3 py-1 text-xs text-lake-700">
                  {experienceLabels[e]}
                </span>
              ))}
            </div>

            <p className="mt-5 text-sm leading-relaxed text-lake-700">{boat.description}</p>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
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
                <p className="mt-1 font-semibold">{boat.registrationNumber}</p>
                <p className="text-xs text-lake-500">Registration</p>
              </div>
              <div className="rounded-xl bg-lake-50 p-3 text-center">
                <Clock size={16} className="mx-auto text-lake-500" />
                <p className="mt-1 font-semibold">{operator?.responseTimeHours}h</p>
                <p className="text-xs text-lake-500">Response time</p>
              </div>
            </div>

            <Reveal className="mt-6">
              <h3 className="font-display text-lg font-medium text-lake-950">Facilities & amenities</h3>
              <ul className="mt-2 grid grid-cols-2 gap-2 text-sm text-lake-700">
                {boat.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-lake-400" /> {a}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="mt-6 rounded-xl border border-lake-100 p-4">
              <h3 className="font-display text-lg font-medium text-lake-950 flex items-center gap-2">
                <LifeBuoy size={16} className="text-lake-600" /> Safety checklist
              </h3>
              <ul className="mt-2 grid grid-cols-2 gap-2 text-sm text-lake-700">
                {boat.safetyEquipment.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <ShieldCheck size={13} className="text-emerald-500" /> {s}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-lake-500">
                Emergency contact: Kariba Marine Police +263 61 2 2XXX · Operator on-call: {operator?.phone}
              </p>
            </Reveal>

            {/* Availability calendar */}
            <Reveal className="mt-6">
              <AvailabilityCalendar boat={boat} bookings={bookings} />
              <p className="mt-2 text-xs text-lake-400">
                Tap a date to see booked times and free slots. Requested bookings hold their slot
                until the operator responds.
              </p>
            </Reveal>

            {/* Reviews */}
            <div className="mt-8">
              <h3 className="font-display text-lg font-medium text-lake-950">Reviews</h3>
              <div className="mt-3 space-y-3">
                {boatReviews.length === 0 && (
                  <p className="text-sm text-lake-500">No reviews yet. Be the first to book and leave feedback.</p>
                )}
                {boatReviews.map((r) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="rounded-xl border border-lake-100 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-lake-900">{r.touristName}</span>
                      <StarRating rating={r.rating} size={12} showNumber={false} />
                    </div>
                    <p className="mt-1 text-sm text-lake-600">{r.comment}</p>
                    <p className="mt-1 text-[11px] text-lake-400">{r.date}</p>
                  </motion.div>
                ))}
              </div>
              <ReviewForm boatId={boat.id} />
            </div>
          </div>

          {/* Booking sidebar */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="sticky top-24 rounded-2xl border border-lake-100 p-5 shadow-sm bg-white"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-lake-950">${boat.priceAmount}</span>
                <span className="text-sm text-lake-500">/ {boat.priceUnit}</span>
              </div>

              <button
                onClick={handleBookClick}
                className="mt-4 w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 transition-colors"
              >
                Request to book
              </button>
              <p className="mt-2 text-center text-[11px] text-lake-400">
                20% deposit to confirm · balance paid on the day
              </p>
              {!currentUser && (
                <p className="mt-2 text-center text-[11px] text-lake-400">
                  You will need to log in or create a free account to send a booking request.
                </p>
              )}

              <div className="mt-5 border-t border-lake-100 pt-4">
                <p className="text-xs font-medium text-lake-500 uppercase tracking-wide">Operated by</p>
                <p className="mt-1 font-semibold text-lake-950">{operator?.businessName}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-lake-600">
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp size={13} className="text-emerald-500" /> Trust {operator?.trustScore}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone size={13} /> {operator?.phone}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {showModal && (
        <BookingModal
          boat={boat}
          initialName={currentUser?.name}
          initialPhone={currentUser?.phone}
          onClose={() => setShowModal(false)}
        />
      )}
    </PageTransition>
  );
}
