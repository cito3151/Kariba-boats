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
import { getPartnerOrgActive } from '../services/partners.service';
import type { PublicBoat } from '../services/boats.service';

export default function HotelDashboard() {
  const { currentUser } = useAuth();
  const hotelId = currentUser?.hotelId ?? null;
  const verified = currentUser?.verificationStatus === 'verified';
  const [search, setSearch] = useState('');
  const [bookingBoat, setBookingBoat] = useState<PublicBoat | null>(null);

  const { data: boatList, loading, error, reload } = useAsync(() => boats.listPublicBoats(), []);
  const {
    data: hotelBookings, loading: bookingsLoading, error: bookingsError, reload: reloadBookings,
  } = useAsync(
    () => (hotelId ? listBookingsForHotel(hotelId) : Promise.resolve([])), [hotelId],
  );
  // Why "Book for guest" is off, shown once above the list. A deactivated hotel
  // (is_verified = false) is refused by guard_hotel_booking, so it is said here too.
  const { data: orgActive } = useAsync(
    () => (hotelId ? getPartnerOrgActive('hotel', hotelId) : Promise.resolve(null)), [hotelId],
  );
  const canBook = verified && Boolean(hotelId) && orgActive !== false;
  const disabledReason = !verified
    ? 'You can book for guests once an administrator verifies your hotel account.'
    : !hotelId
      ? 'Your hotel account is verified but not linked to a hotel yet, so you cannot book for guests. Contact us to link it.'
      : 'Your hotel is not active on Kariba Lake Connect, so new bookings are paused. Contact us to reactivate it.';

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

      {!verified && (
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
            canBook={canBook}
            disabledReason={disabledReason}
            onBook={setBookingBoat}
          />
        )}
      </PortalSection>

      <PortalSection title="Your referred bookings" className="mt-10">
        {/* The spinner only until the first answer: a reload after a cancel or an
            edit keeps the list in place instead of swapping it for a spinner. */}
        {bookingsLoading && hotelBookings == null && <LoadingState large label="Loading bookings" />}
        {bookingsError && <ErrorState large message={bookingsError} onRetry={reloadBookings} />}
        {!bookingsError && hotelBookings != null && (
          <PartnerBookingList
            bookings={hotelBookings}
            boatName={(b) => b.boatName}
            emptyText="No bookings referred yet."
            onCancelled={reloadBookings}
          />
        )}
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
