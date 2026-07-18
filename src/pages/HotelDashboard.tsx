import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Wallet, Users, ShieldCheck, TrendingUp } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StarRating from '../components/StarRating';
import StatusBadge from '../components/StatusBadge';
import BookingModal from '../components/BookingModal';
import DashboardBanner from '../components/DashboardBanner';
import BoatImage from '../components/BoatImage';
import { useAppData } from '../data/AppDataContext';
import { useAuth } from '../data/AuthContext';
import { photos } from '../data/photos';
import type { Boat } from '../data/types';

export default function HotelDashboard() {
  const { boats, bookings, hotels, currentHotelId, setCurrentHotelId } = useAppData();
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [bookingBoat, setBookingBoat] = useState<Boat | null>(null);
  const canSwitchHotel = currentUser?.role === 'admin';

  useEffect(() => {
    if (currentUser?.role === 'hotel' && currentUser.linkedHotelId) {
      setCurrentHotelId(currentUser.linkedHotelId);
    }
  }, [currentUser]);

  const hotel = hotels.find((h) => h.id === currentHotelId) ?? hotels[0];

  const hotelBookings = bookings
    .filter((b) => b.hotelId === currentHotelId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const commissionEarned = hotelBookings.reduce((sum, b) => {
    if (b.status === 'declined' || b.status === 'cancelled' || b.status === 'requested') return sum;
    return sum + (b.priceTotal * hotel.commissionRate) / 100;
  }, 0);

  const pendingCount = hotelBookings.filter((b) => b.status === 'requested').length;

  const filteredBoats = useMemo(
    () => boats.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()) || b.location.toLowerCase().includes(search.toLowerCase())),
    [boats, search],
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <DashboardBanner
          image={photos.resort1}
          eyebrow="Hotel portal"
          title="Book a boat for your guest"
          icon={Building2}
        />

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
          {canSwitchHotel ? (
            <select
              value={currentHotelId}
              onChange={(e) => setCurrentHotelId(e.target.value)}
              className="rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm shadow-sm">
              {hotel.name}
              {!hotel.verified && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Pending verification
                </span>
              )}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Referral commission rate',
              value: `${hotel.commissionRate}%`,
              icon: TrendingUp,
              accent: 'text-lake-600',
            },
            {
              label: 'Commission earned to date',
              value: `$${commissionEarned.toFixed(0)}`,
              icon: Wallet,
              accent: 'text-emerald-600',
            },
            {
              label: 'Pending guest requests',
              value: pendingCount,
              icon: Users,
              accent: 'text-amber-600',
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl border border-lake-100 bg-white p-4 shadow-sm"
            >
              <stat.icon size={18} className={stat.accent} />
              <p className="mt-2 text-2xl font-bold text-lake-950">{stat.value}</p>
              <p className="text-xs text-lake-500">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Search + book */}
        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">Search available boats</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by boat name or location..."
            className="mt-2 w-full sm:w-96 rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
          />

          <div className="mt-4 divide-y divide-lake-100 rounded-2xl border border-lake-100 bg-white overflow-hidden">
            {filteredBoats.map((boat) => (
              <div key={boat.id} className="flex items-center gap-4 p-3 sm:p-4">
                <BoatImage src={boat.images[0]} className="h-14 w-20 rounded-lg shrink-0" showBadge={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-lake-950 truncate">{boat.name}</p>
                    {boat.verified && <ShieldCheck size={13} className="text-lake-600 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-lake-500">
                    <StarRating rating={boat.rating} size={11} />
                    <span>·</span>
                    <span>{boat.location}</span>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-lake-950">${boat.priceAmount}</p>
                  <p className="text-xs text-lake-500">/{boat.priceUnit}</p>
                </div>
                <button
                  onClick={() => setBookingBoat(boat)}
                  className="shrink-0 rounded-lg bg-lake-700 px-3 py-2 text-xs font-semibold text-white hover:bg-lake-800 transition-colors"
                >
                  Book for guest
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Referred bookings */}
        <div className="mt-10">
          <h2 className="font-semibold text-lake-950">Your referred bookings</h2>
          <div className="mt-3 space-y-2">
            <AnimatePresence>
              {hotelBookings.length === 0 && (
                <p className="text-sm text-lake-500">No bookings referred yet from {hotel.name}.</p>
              )}
              {hotelBookings.map((b) => {
                const boat = boats.find((bt) => bt.id === b.boatId);
                const commission = ((b.priceTotal * hotel.commissionRate) / 100).toFixed(0);
                return (
                  <motion.div
                    key={b.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lake-100 bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-lake-950">
                        {b.touristName} → {boat?.name}
                      </p>
                      <p className="text-xs text-lake-500">
                        {b.date} · {b.groupSize} guests · booked {new Date(b.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-lake-600">Commission: ${commission}</span>
                      <StatusBadge status={b.status} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {bookingBoat && (
        <BookingModal boat={bookingBoat} hotelId={currentHotelId} onClose={() => setBookingBoat(null)} />
      )}
    </PageTransition>
  );
}
