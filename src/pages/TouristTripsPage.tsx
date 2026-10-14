import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { Anchor, MapPin, Star, UserCheck } from 'lucide-react';
import PortalPage from '../components/portal/PortalPage';
import Reveal from '../components/Reveal';
import { portalPhotos } from '../data/photos';
import PortalSection from '../components/portal/PortalSection';
import { portalCard, portalButtonPrimary, portalButtonSecondary } from '../components/portal/styles';
import StatusBadge from '../components/StatusBadge';
import BookingFigures from '../components/BookingFigures';
import BookingRef from '../components/BookingRef';
import ReviewForm from '../components/ReviewForm';
import CancelBookingButton from '../components/CancelBookingButton';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import EmergencyContacts from '../components/EmergencyContacts';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import * as bookingsSvc from '../services/bookings.service';

const CANCELLABLE = new Set(['requested', 'confirmed', 'deposit_paid']);

export default function TouristTripsPage() {
  const { currentUser } = useAuth();
  const touristId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => bookingsSvc.listMyBookings(touristId), [touristId]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const reduceMotion = useReducedMotion();

  const rows = data ?? [];

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
        <PortalSection title="Bookings" className="min-w-0">
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
                const canReview = b.status === 'completed' && !reviewedIds.has(b.id) && reviewingId !== b.id;
                const reviewed = reviewedIds.has(b.id);
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

                    {(canCancel || canReview || reviewed) && (
                      <div className="mt-3.5 flex flex-wrap items-start gap-2 border-t border-lake-100 pt-3.5">
                        {canCancel && (
                          <CancelBookingButton booking={b} onCancelled={reload} />
                        )}
                        {canReview && (
                          <button onClick={() => setReviewingId(b.id)} className={portalButtonSecondary}>
                            <Star size={15} /> Leave a review
                          </button>
                        )}
                        {reviewed && (
                          <span className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-emerald-700"><Star size={15} className="fill-emerald-600 text-emerald-600" /> Reviewed</span>
                        )}
                      </div>
                    )}

                    {reviewingId === b.id && (
                      <ReviewForm bookingId={b.id} touristId={touristId}
                        onDone={() => {
                          setReviewedIds((prev) => new Set(prev).add(b.id));
                          setReviewingId(null);
                        }} />
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
