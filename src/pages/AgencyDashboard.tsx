import { useMemo, useState } from 'react';
import { Briefcase, Users, ShieldCheck } from 'lucide-react';
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
import { listBookingsForAgency } from '../services/bookings.service';
import { getPartnerOrgActive } from '../services/partners.service';
import type { PublicBoat } from '../services/boats.service';

export default function AgencyDashboard() {
  const { currentUser } = useAuth();
  const agencyId = currentUser?.agencyId ?? null;
  const verified = currentUser?.verificationStatus === 'verified';
  const [search, setSearch] = useState('');
  const [bookingBoat, setBookingBoat] = useState<PublicBoat | null>(null);

  const { data: boatList, loading, error, reload } = useAsync(() => boats.listPublicBoats(), []);
  const {
    data: agencyBookings, loading: bookingsLoading, error: bookingsError, reload: reloadBookings,
  } = useAsync(
    () => (agencyId ? listBookingsForAgency(agencyId) : Promise.resolve([])), [agencyId],
  );
  // Why "Book for client" is off, shown once above the list. A deactivated agency
  // (is_verified = false) is refused by guard_hotel_booking, so it is said here too.
  const { data: orgActive } = useAsync(
    () => (agencyId ? getPartnerOrgActive('agency', agencyId) : Promise.resolve(null)), [agencyId],
  );
  const canBook = verified && Boolean(agencyId) && orgActive !== false;
  const disabledReason = !verified
    ? 'You can book for clients once an administrator verifies your agency account.'
    : !agencyId
      ? 'Your agency account is verified but not linked to an agency yet, so you cannot book for clients. Contact us to link it.'
      : 'Your agency is not active on Kariba Lake Connect, so new bookings are paused. Contact us to reactivate it.';

  const filteredBoats = useMemo(
    () => (boatList ?? []).filter(
      (b) => b.name.toLowerCase().includes(search.toLowerCase())
        || b.location.toLowerCase().includes(search.toLowerCase()),
    ),
    [boatList, search],
  );

  const pendingCount = (agencyBookings ?? []).filter((b) => b.status === 'requested').length;

  return (
    <PartnerPortalPage
      eyebrow="Travel agency portal"
      icon={Briefcase}
      title={currentUser?.businessName || 'Book boats for your clients'}
      subtitle="Book approved boats on behalf of your clients and follow each request through to the trip."
    >
      <VerificationBanner />
      {!verified && <div className="mb-4"><DocumentUploader /></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile index={0} icon={Users} label="Pending client requests" value={loadedFigure(agencyBookings, bookingsLoading, pendingCount)} />
        <StatTile index={1} icon={Briefcase} label="Bookings made" value={loadedFigure(agencyBookings, bookingsLoading, (agencyBookings ?? []).length)} />
        <StatTile index={2} icon={ShieldCheck} label="Boats available to book" value={loadedFigure(boatList, loading, (boatList ?? []).length)} />
      </div>

      <PortalSection title="Available boats" className="mt-10">
        <label htmlFor="agency-boat-search" className="sr-only">Search boats by name or location</label>
        {/* White, not lake-50: this field sits on the lake-50 page, not in a card. */}
        <input
          id="agency-boat-search"
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
            actionLabel="Book for client"
            canBook={canBook}
            disabledReason={disabledReason}
            onBook={setBookingBoat}
          />
        )}
      </PortalSection>

      <PortalSection title="Your client bookings" className="mt-10">
        {/* The spinner only until the first answer: a reload after a cancel or an
            edit keeps the list in place instead of swapping it for a spinner. */}
        {bookingsLoading && agencyBookings == null && <LoadingState large label="Loading bookings" />}
        {bookingsError && <ErrorState large message={bookingsError} onRetry={reloadBookings} />}
        {!bookingsError && agencyBookings != null && (
          <PartnerBookingList
            bookings={agencyBookings}
            boatName={(b) => b.boatName}
            showCaptain
            emptyText="No bookings made yet."
            onCancelled={reloadBookings}
          />
        )}
      </PortalSection>

      {bookingBoat && (
        <BookingModal
          boat={bookingBoat}
          touristId={null}
          onBehalfOfGuest
          onClose={() => { setBookingBoat(null); reloadBookings(); }}
        />
      )}
    </PartnerPortalPage>
  );
}
