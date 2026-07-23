import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Users, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StatusBadge from '../components/StatusBadge';
import BookingModal from '../components/BookingModal';
import DashboardBanner from '../components/DashboardBanner';
import BoatImage from '../components/BoatImage';
import StatTile from '../components/StatTile';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import { priceView } from '../components/BoatCard';
import { staggerContainer, staggerItem } from '../components/motion';
import VerificationBanner from '../components/VerificationBanner';
import { useAuth } from '../data/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { photos } from '../data/photos';
import * as boats from '../services/boats.service';
import { listBookingsForHotel } from '../services/bookings.service';
import type { PublicBoat } from '../services/boats.service';

export default function HotelDashboard() {
  const { currentUser } = useAuth();
  const hotelId = currentUser?.hotelId ?? null;
  const [search, setSearch] = useState('');
  const [bookingBoat, setBookingBoat] = useState<PublicBoat | null>(null);

  const { data: boatList, loading, error, reload } = useAsync(() => boats.listPublicBoats(), []);
  const { data: hotelBookings, reload: reloadBookings } = useAsync(
    () => (hotelId ? listBookingsForHotel(hotelId) : Promise.resolve([])), [hotelId],
  );

  const boatsById = useMemo(() => {
    const m = new Map<string, PublicBoat>();
    (boatList ?? []).forEach((b) => m.set(b.id, b));
    return m;
  }, [boatList]);

  const filteredBoats = useMemo(
    () => (boatList ?? []).filter(
      (b) => b.name.toLowerCase().includes(search.toLowerCase())
        || b.location.toLowerCase().includes(search.toLowerCase()),
    ),
    [boatList, search],
  );

  const pendingCount = (hotelBookings ?? []).filter((b) => b.status === 'requested').length;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <DashboardBanner
          image={photos.resort1}
          eyebrow="Hotel portal"
          title={currentUser?.businessName || 'Book a boat for your guest'}
          icon={Building2}
        />

        <div className="mt-4"><VerificationBanner /></div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile index={0} icon={Users} label="Pending guest requests" value={pendingCount} />
          <StatTile index={1} icon={Building2} label="Referred bookings" value={(hotelBookings ?? []).length} />
          <StatTile index={2} icon={ShieldCheck} label="Boats available to book" value={(boatList ?? []).length} />
        </div>

        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">Search available boats</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by boat name or location..."
            className="mt-2 w-full sm:w-96 rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
          />

          {loading && <LoadingState label="Loading boats" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {!loading && !error && (
            <motion.div variants={staggerContainer} initial="hidden" animate="show"
              className="mt-4 divide-y divide-lake-100 rounded-2xl border border-lake-100 bg-white overflow-hidden">
              {filteredBoats.length === 0 && (
                <div className="p-6"><EmptyState title="No boats found" hint="No approved boats match your search yet." /></div>
              )}
              {filteredBoats.map((boat) => {
                const price = priceView(boat);
                return (
                  <motion.div variants={staggerItem} key={boat.id} className="flex items-center gap-4 p-3 sm:p-4 transition-colors hover:bg-lake-50">
                    <BoatImage src={`illustration:${boat.boatType}`} className="h-14 w-20 rounded-lg shrink-0" showBadge={false} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-lake-950 truncate">{boat.name}</p>
                        {boat.operatorVerified && <ShieldCheck size={13} className="text-lake-600 shrink-0" />}
                      </div>
                      <p className="text-xs text-lake-500">{boat.location}</p>
                    </div>
                    {price && (
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-lake-950">${price.amount}</p>
                        <p className="text-xs text-lake-500">/{price.unit}</p>
                      </div>
                    )}
                    <button
                      onClick={() => setBookingBoat(boat)}
                      disabled={!hotelId || currentUser?.verificationStatus !== 'verified'}
                      title={hotelId && currentUser?.verificationStatus === 'verified' ? '' : 'Your hotel account must be verified and linked before you can book for guests'}
                      className="shrink-0 rounded-lg bg-lake-700 px-3 py-2 text-xs font-semibold text-white hover:bg-lake-800 transition-colors disabled:opacity-50"
                    >
                      Book for guest
                    </button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        <div className="mt-10">
          <h2 className="font-semibold text-lake-950">Your referred bookings</h2>
          <div className="mt-3 space-y-2">
            <AnimatePresence>
              {(hotelBookings ?? []).length === 0 && (
                <p className="text-sm text-lake-500">No bookings referred yet.</p>
              )}
              {(hotelBookings ?? []).map((b) => (
                <motion.div key={b.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lake-100 bg-white p-3">
                  <div>
                    <p className="text-sm font-medium text-lake-950">
                      {b.guestName} → {boatsById.get(b.boatId)?.name ?? 'Boat'}
                    </p>
                    <p className="text-xs text-lake-500">
                      {b.startDate} · {b.groupSize} guests · ${b.priceTotal}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {bookingBoat && (
        <BookingModal
          boat={bookingBoat}
          touristId={null}
          hotelId={hotelId}
          onClose={() => { setBookingBoat(null); reloadBookings(); }}
        />
      )}
    </PageTransition>
  );
}
