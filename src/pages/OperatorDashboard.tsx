import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardCheck, Wallet, Calendar, TrendingUp, Check, X, Anchor } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StatusBadge from '../components/StatusBadge';
import DashboardBanner from '../components/DashboardBanner';
import BoatImage from '../components/BoatImage';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { useAppData } from '../data/AppDataContext';
import { useAuth } from '../data/AuthContext';
import { photos } from '../data/photos';

const PLATFORM_COMMISSION = 0.12;

export default function OperatorDashboard() {
  const { boats, bookings, operators, currentOperatorId, setCurrentOperatorId, setBookingStatus } =
    useAppData();
  const { currentUser } = useAuth();
  const canSwitchOperator = currentUser?.role === 'admin';

  useEffect(() => {
    if (currentUser?.role === 'operator' && currentUser.linkedOperatorId) {
      setCurrentOperatorId(currentUser.linkedOperatorId);
    }
  }, [currentUser]);

  const operator = operators.find((o) => o.id === currentOperatorId) ?? operators[0];
  const myBoats = boats.filter((b) => b.operatorId === currentOperatorId);
  const [calendarBoatId, setCalendarBoatId] = useState<string | null>(null);
  const calendarBoat = myBoats.find((b) => b.id === calendarBoatId) ?? myBoats[0];

  useEffect(() => {
    setCalendarBoatId(null);
  }, [currentOperatorId]);
  const myBoatIds = myBoats.map((b) => b.id);
  const myBookings = bookings
    .filter((b) => myBoatIds.includes(b.boatId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const requested = myBookings.filter((b) => b.status === 'requested');
  const upcoming = myBookings.filter((b) => b.status === 'confirmed' || b.status === 'deposit_paid');
  const completed = myBookings.filter((b) => b.status === 'completed');

  const earnings = useMemo(() => {
    const gross = myBookings
      .filter((b) => ['confirmed', 'deposit_paid', 'completed'].includes(b.status))
      .reduce((sum, b) => sum + b.priceTotal, 0);
    return { gross, payout: gross * (1 - PLATFORM_COMMISSION) };
  }, [myBookings]);

  const boatName = (id: string) => myBoats.find((b) => b.id === id)?.name ?? 'Unknown boat';

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <DashboardBanner
          image={photos.kapentaRig}
          eyebrow="Operator portal"
          title={operator.businessName}
          icon={ClipboardCheck}
        />

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
          {canSwitchOperator ? (
            <select
              value={currentOperatorId}
              onChange={(e) => setCurrentOperatorId(e.target.value)}
              className="rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.businessName}
                </option>
              ))}
            </select>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-lake-100 bg-white px-3 py-2 text-sm shadow-sm">
              {operator.businessName}
              {!operator.verified && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Pending verification
                </span>
              )}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Trust score', value: operator.trustScore, icon: TrendingUp, accent: 'text-lake-600' },
            { label: 'Pending requests', value: requested.length, icon: Calendar, accent: 'text-amber-600' },
            { label: 'Upcoming trips', value: upcoming.length, icon: Anchor, accent: 'text-lake-600' },
            {
              label: 'Estimated payout',
              value: `$${earnings.payout.toFixed(0)}`,
              icon: Wallet,
              accent: 'text-emerald-600',
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-lake-100 bg-white p-4 shadow-sm"
            >
              <stat.icon size={18} className={stat.accent} />
              <p className="mt-2 text-xl font-bold text-lake-950">{stat.value}</p>
              <p className="text-xs text-lake-500">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Requests */}
        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">Incoming requests</h2>
          <div className="mt-3 space-y-2">
            <AnimatePresence>
              {requested.length === 0 && (
                <p className="text-sm text-lake-500">No pending requests right now.</p>
              )}
              {requested.map((b) => (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-lake-950">
                      {b.touristName} {b.hotelId && <span className="text-xs text-lake-500">(via hotel)</span>}
                    </p>
                    <p className="text-xs text-lake-600">
                      {boatName(b.boatId)} · {b.date} · {b.groupSize} people · ${b.priceTotal}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBookingStatus(b.id, 'confirmed')}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Check size={13} /> Confirm
                    </button>
                    <button
                      onClick={() => setBookingStatus(b.id, 'declined')}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-lake-200 px-3 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-50"
                    >
                      <X size={13} /> Decline
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Upcoming */}
        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">Upcoming confirmed trips</h2>
          <div className="mt-3 space-y-2">
            {upcoming.length === 0 && <p className="text-sm text-lake-500">Nothing confirmed yet.</p>}
            {upcoming.map((b) => (
              <motion.div
                key={b.id}
                layout
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lake-100 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium text-lake-950">
                    {b.touristName} to {boatName(b.boatId)}
                  </p>
                  <p className="text-xs text-lake-500">
                    {b.date} · {b.groupSize} people · Deposit ${b.depositAmount}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.status === 'confirmed' && (
                    <button
                      onClick={() => setBookingStatus(b.id, 'deposit_paid')}
                      className="rounded-lg bg-lake-100 px-3 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-200"
                    >
                      Mark deposit received
                    </button>
                  )}
                  {b.status === 'deposit_paid' && (
                    <button
                      onClick={() => setBookingStatus(b.id, 'completed')}
                      className="rounded-lg bg-lake-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-lake-800"
                    >
                      Mark trip completed
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Availability calendar */}
        {calendarBoat && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-lake-950 flex items-center gap-2">
                <Calendar size={16} className="text-lake-600" /> Boat calendar
              </h2>
              {myBoats.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {myBoats.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setCalendarBoatId(b.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        calendarBoat.id === b.id
                          ? 'bg-lake-700 text-white'
                          : 'bg-white border border-lake-200 text-lake-700 hover:bg-lake-50'
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 max-w-xl">
              <AvailabilityCalendar boat={calendarBoat} bookings={bookings} showGuestNames />
            </div>
          </div>
        )}

        {/* My boats */}
        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">My boats</h2>
          {myBoats.length === 0 && (
            <p className="mt-3 text-sm text-lake-500">
              No boats listed yet. Once your account is verified, contact the Kariba Lake Access team
              to add your first boat.
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myBoats.map((boat) => (
              <div key={boat.id} className="flex items-center gap-3 rounded-xl border border-lake-100 bg-white p-3">
                <BoatImage src={boat.images[0]} className="h-12 w-16 rounded-lg shrink-0" showBadge={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-lake-950 truncate">{boat.name}</p>
                  <p className="text-xs text-lake-500">
                    ${boat.priceAmount}/{boat.priceUnit} · {boat.rating.toFixed(1)}★ ({boat.reviewCount})
                  </p>
                </div>
                {boat.verified ? (
                  <span className="text-xs font-semibold text-lake-600">Verified</span>
                ) : (
                  <span className="text-xs font-semibold text-amber-600">Pending</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {completed.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold text-lake-950">Completed trips</h2>
            <div className="mt-3 space-y-2">
              {completed.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-lake-100 bg-white p-3 text-sm">
                  <span>{b.touristName} to {boatName(b.boatId)} · {b.date}</span>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
