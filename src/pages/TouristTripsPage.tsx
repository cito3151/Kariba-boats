import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Star } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StatusBadge from '../components/StatusBadge';
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

  const rows = data ?? [];

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-lake-950 sm:text-[2rem]">My trips</h1>
        <p className="mt-2 text-base leading-normal text-lake-700">Your booking requests and their status.</p>

        <div className="mt-5 space-y-3">
          {loading && <LoadingState large label="Loading your trips" />}
          {error && <ErrorState large message={error} onRetry={reload} />}
          {!loading && !error && rows.length === 0 && (
            <EmptyState large
              title="You have not booked any trips yet"
              hint="Browse boats and send a booking request to get started."
              action={
                <Link to="/" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sunset-500 px-4 py-2.5 text-sm font-semibold text-lake-950 hover:bg-sunset-400">
                  <Anchor size={16} /> Browse boats
                </Link>
              }
            />
          )}
          <AnimatePresence>
            {rows.map((b) => (
              <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} className="rounded-2xl border border-lake-100 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-[1.0625rem] font-semibold leading-snug text-lake-950">{b.boatName}</h3>
                    <p className="mt-1 break-words text-[15px] leading-normal tabular-nums text-lake-700">
                      {b.boatLocation} · {bookingsSvc.tripWhen(b)} · {b.groupSize} guest{b.groupSize > 1 ? 's' : ''} · {bookingsSvc.tripPrice(b)}
                    </p>
                    {b.captainName && (
                      <p className="mt-1 text-[15px] leading-normal text-lake-700">Captain: <span className="font-semibold text-lake-900">{b.captainName}</span> · <span className="tabular-nums">{b.captainPhone}</span></p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <StatusBadge status={b.status} />
                    {CANCELLABLE.has(b.status) && (
                      <CancelBookingButton booking={b} onCancelled={reload} />
                    )}
                    {b.status === 'completed' && !reviewedIds.has(b.id) && reviewingId !== b.id && (
                      <button onClick={() => setReviewingId(b.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-lake-200 px-3 py-2 text-sm font-semibold text-lake-700 hover:bg-lake-50">
                        <Star size={15} /> Leave a review
                      </button>
                    )}
                    {reviewedIds.has(b.id) && (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Star size={15} className="fill-emerald-600 text-emerald-600" /> Reviewed</span>
                    )}
                  </div>
                </div>
                {reviewingId === b.id && (
                  <ReviewForm bookingId={b.id} touristId={touristId}
                    onDone={() => {
                      setReviewedIds((prev) => new Set(prev).add(b.id));
                      setReviewingId(null);
                    }} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {rows.length > 0 && <div className="mt-8"><EmergencyContacts /></div>}
      </div>
    </PageTransition>
  );
}
