import { useMemo, useState } from 'react';
import { Building2, Users, ShieldCheck } from 'lucide-react';
import PartnerPortalPage from '../components/partner/PartnerPortalPage';
import BookableBoatList from '../components/partner/BookableBoatList';
import PartnerBookingList from '../components/partner/PartnerBookingList';
import PortalSection from '../components/portal/PortalSection';
import BookingModal from '../components/BookingModal';
import StatTile from '../components/StatTile';
import { LoadingState, ErrorState } from '../components/StateViews';
import VerificationBanner from '../components/VerificationBanner';
import DocumentUploader from '../components/verification/DocumentUploader';
import { useAuth } from '../data/AuthContext';
import { loadedFigure, useAsync } from '../hooks/useAsync';
import * as boats from '../services/boats.service';
import { listBookingsForHotel } from '../services/bookings.service';
import type { PublicBoat } from '../services/boats.service';

export default function HotelDashboard() {
  const { currentUser } = useAuth();
  const hotelId = currentUser?.hotelId ?? null;
  const [search, setSearch] = useState('');
  const [bookingBoat, setBookingBoat] = useState<PublicBoat | null>(null);

  const { data: boatList, loading, error, reload } = useAsync(() => boats.listPublicBoats(), []);
  const { data: hotelBookings, loading: bookingsLoading, reload: reloadBookings } = useAsync(
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
    <PartnerPortalPage
      eyebrow="Hotel portal"
      icon={Building2}
      title={currentUser?.businessName || 'Book a boat for your guest'}
      subtitle="Book approved boats on behalf of your guests and follow each request through to the trip."
    >
      <VerificationBanner />

      {currentUser?.verificationStatus !== 'verified' && (
        <div className="mb-4"><DocumentUploader /></div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile index={0} icon={Users} label="Pending guest requests" value={loadedFigure(hotelBookings, bookingsLoading, pendingCount)} />
        <StatTile index={1} icon={Building2} label="Referred bookings" value={loadedFigure(hotelBookings, bookingsLoading, (hotelBookings ?? []).length)} />
        <StatTile index={2} icon={ShieldCheck} label="Boats available to book" value={loadedFigure(boatList, loading, (boatList ?? []).length)} />
      </div>

      <PortalSection title="Available boats" className="mt-10">
        <label htmlFor="hotel-boat-search" className="sr-only">Search boats by name or location</label>
        {/* White, not lake-50: this field sits on the lake-50 page, not in a card. */}
        <input
          id="hotel-boat-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by boat name or location..."
          className="mb-4 w-full rounded-lg border border-lake-200 bg-white px-3.5 py-3 text-base text-lake-950 outline-none focus:border-lake-500 sm:w-96"
        />

        {loading && <LoadingState large label="Loading boats" />}
        {error && <ErrorState large message={error} onRetry={reload} />}
        {!loading && !error && (
          <BookableBoatList
            boats={filteredBoats}
            actionLabel="Book for guest"
            canBook={Boolean(hotelId) && currentUser?.verificationStatus === 'verified'}
            disabledReason="Your hotel account must be verified and linked before you can book for guests"
            onBook={setBookingBoat}
          />
        )}
      </PortalSection>

      <PortalSection title="Your referred bookings" className="mt-10">
        <PartnerBookingList
          bookings={hotelBookings ?? []}
          boatName={(b) => boatsById.get(b.boatId)?.name ?? 'Boat'}
          emptyText="No bookings referred yet."
          onCancelled={reloadBookings}
        />
      </PortalSection>

      {bookingBoat && (
        <BookingModal
          boat={bookingBoat}
          touristId={null}
          hotelId={hotelId}
          onBehalfOfGuest
          onClose={() => { setBookingBoat(null); reloadBookings(); }}
        />
      )}
    </PartnerPortalPage>
  );
}
