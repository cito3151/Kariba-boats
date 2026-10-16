import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { Anchor, MapPin, Star, UserCheck } from 'lucide-react';
import PortalPage from '../components/portal/PortalPage';
import Reveal from '../components/Reveal';
import { portalPhotos } from '../data/photos';
import PortalSection from '../components/portal/PortalSection';
import { portalCard, portalButtonPrimary } from '../components/portal/styles';
import StatusBadge from '../components/StatusBadge';
import BookingFigures from '../components/BookingFigures';
import BookingRef from '../components/BookingRef';
import ReviewForm from '../components/ReviewForm';
import ReviewCard from '../components/reviews/ReviewCard';
import CancelBookingButton from '../components/CancelBookingButton';
import CancellationSummary from '../components/CancellationSummary';
import EditBookingButton from '../components/EditBookingButton';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import EmergencyContacts from '../components/EmergencyContacts';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import * as bookingsSvc from '../services/bookings.service';
import * as reviewsSvc from '../services/reviews.service';

const CANCELLABLE = new Set(['requested', 'confirmed', 'deposit_paid']);

export default function TouristTripsPage() {
  const { currentUser } = useAuth();
  const touristId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => bookingsSvc.listMyBookings(touristId), [touristId]);
  // The guest's own reviews, hidden ones included, so a trip already reviewed
  // shows its review (and any reply or moderation notice) instead of asking again.
  const { data: myReviews, loading: reviewsLoading, reload: reloadReviews } = useAsync(
    () => reviewsSvc.listMyReviews(touristId), [touristId],
  );
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const rows = data ?? [];
  const reviewByBooking = new Map((myReviews ?? []).map((r) => [r.bookingId, r]));
  // Until the reviews have loaded, a completed trip is neither "rate it" nor
  // "reviewed", so the prompt never flashes up for a trip already rated.
  const reviewsKnown = !(reviewsLoading && myReviews == null);
  const toRate = reviewsKnown
    ? rows.filter((b) => b.status === 'completed' && !reviewByBooking.has(b.id)).length
    : 0;

  // The tourist account is this one page, so it uses PortalPage directly rather
  // than through a per-portal wrapper with tabs.
  return (
    <PortalPage
      eyebrow="Your account"
      icon={Anchor}
      photo={portalPhotos.trips}
      title="My trips"
      subtitle="Your booking requests and their status."
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'My trips' }]}
    >
      {/* Emergency contacts sit beside the trips on a wide screen. The trips come
          first in the source, so a phone opens on them and keyboard order matches
          the left-to-right reading order. */}
      <div className={`grid items-start gap-8 ${rows.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
        <PortalSection title="Bookings" className="min-w-0"
          description={toRate > 0
            ? `You have ${toRate} completed trip${toRate === 1 ? '' : 's'} to rate. Your review helps other guests choose.`
            : undefined}>
          <div className="space-y-3">
            {loading && <LoadingState large label="Loading your trips" />}
            {error && <ErrorState large message={error} onRetry={reload} />}
            {!loading && !error && rows.length === 0 && (
              <EmptyState large
                title="You have not booked any trips yet"
                hint="Browse boats and send a booking request to get started."
                action={
                  <Link to="/" className={`${portalButtonPrimary} mt-2`}>
                    <Anchor size={16} /> Browse boats
                  </Link>
                }
              />
            )}
            <AnimatePresence>
              {rows.map((b) => {
                const canCancel = CANCELLABLE.has(b.status);
                const review = reviewByBooking.get(b.id);
                const writing = reviewingId === b.id;
                const canReview = b.status === 'completed' && reviewsKnown && !review && !writing;
                return (
                  <Reveal key={b.id} layout={!reduceMotion}
                    exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                    className={`${portalCard} p-4 sm:p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{b.boatName}</h3>
                        {b.boatLocation && (
                          <p className="mt-1 flex items-start gap-1.5 text-[15px] leading-snug text-lake-700">
                            <MapPin size={15} className="mt-0.5 shrink-0 text-lake-600" aria-hidden />
                            <span className="min-w-0 break-words">{b.boatLocation}</span>
                          </p>
                        )}
                        <BookingRef reference={b.reference} className="mt-2" />
                      </div>
                      <StatusBadge status={b.status} />
                    </div>

                    <BookingFigures booking={b} showGuest={false} />

                    {b.captainName && (
                      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-[15px] leading-normal text-lake-700">
                        <UserCheck size={16} className="text-emerald-700" aria-hidden /> Captain: <span className="font-semibold text-lake-900">{b.captainName}</span> · <span className="tabular-nums">{b.captainPhone}</span>
                      </p>
                    )}

                    <CancellationSummary booking={b} viewer="guest" onChanged={reload} />

                    {canCancel && (
                      <div className="mt-3.5 flex flex-wrap items-start gap-2 border-t border-lake-100 pt-3.5">
                        {/* Only while the operator has not answered (it renders nothing
                            otherwise); after that the guest asks them, or cancels. */}
                        <EditBookingButton booking={b} onSaved={reload} />
                        <CancelBookingButton booking={b} onCancelled={reload} />
                      </div>
                    )}

                    {/* A completed trip with no review asks for one, in its own
                        band so it reads as the next step rather than a footnote. */}
                    {canReview && (
                      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sunset-200 bg-sunset-50 px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-base font-bold text-lake-950">
                            <Star size={18} className="fill-sunset-500 text-sunset-600" aria-hidden /> Rate your trip
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-lake-800">How was {b.boatName}? It takes a minute.</p>
                        </div>
                        <button type="button" onClick={() => setReviewingId(b.id)} className={`${portalButtonPrimary} min-h-11`}>
                          Rate your trip
                        </button>
                      </div>
                    )}

                    {writing && (
                      <ReviewForm bookingId={b.id} touristId={touristId} boatName={b.boatName}
                        onSubmitted={reloadReviews}
                        onClose={() => setReviewingId(null)} />
                    )}

                    {review && !writing && (
                      <div className="mt-3.5 border-t border-lake-100 pt-3.5">
                        <p className="mb-3 text-sm font-bold uppercase tracking-[0.05em] text-lake-700">Your review</p>
                        <ReviewCard review={review} showHidden />
                      </div>
                    )}
                  </Reveal>
                );
              })}
            </AnimatePresence>
          </div>
        </PortalSection>

        {rows.length > 0 && <div className="min-w-0"><EmergencyContacts /></div>}
      </div>
    </PortalPage>
  );
}
