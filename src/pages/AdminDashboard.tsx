import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Anchor, DollarSign, Clock, Check, X, Building2, ClipboardCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import StatusBadge from '../components/StatusBadge';
import DashboardBanner from '../components/DashboardBanner';
import { useAppData } from '../data/AppDataContext';
import { photos } from '../data/photos';

const entityIcon = { boat: Anchor, operator: ClipboardCheck, hotel: Building2 } as const;

export default function AdminDashboard() {
  const { boats, bookings, hotels, verifications, setVerificationDecision } = useAppData();

  const pendingVerifications = verifications.filter((v) => v.status === 'pending');
  const totalGMV = bookings
    .filter((b) => b.status !== 'declined' && b.status !== 'cancelled')
    .reduce((sum, b) => sum + b.priceTotal, 0);
  const verifiedBoats = boats.filter((b) => b.verified).length;

  const statusCounts = bookings.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <DashboardBanner
          image={photos.wildlife1}
          eyebrow="Admin panel"
          title="Platform oversight"
          icon={ShieldCheck}
        />

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total bookings', value: bookings.length, icon: Anchor },
            { label: 'Gross booking value', value: `$${totalGMV}`, icon: DollarSign },
            { label: `Verified boats`, value: `${verifiedBoats}/${boats.length}`, icon: ShieldCheck },
            { label: 'Pending verifications', value: pendingVerifications.length, icon: Clock },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-lake-100 bg-white p-4 shadow-sm"
            >
              <stat.icon size={18} className="text-lake-600" />
              <p className="mt-2 text-xl font-bold text-lake-950">{stat.value}</p>
              <p className="text-xs text-lake-500">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Verification queue */}
        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">Verification queue</h2>
          <div className="mt-3 space-y-2">
            <AnimatePresence>
              {pendingVerifications.length === 0 && (
                <p className="text-sm text-lake-500">Nothing pending review.</p>
              )}
              {pendingVerifications.map((v) => {
                const Icon = entityIcon[v.entityType];
                return (
                  <motion.div
                    key={v.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-lake-600" />
                      <div>
                        <p className="text-sm font-medium text-lake-950">{v.entityName}</p>
                        <p className="text-xs text-lake-500">
                          {v.entityType} · submitted {v.submittedDate}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVerificationDecision(v.id, 'approved')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <Check size={13} /> Approve
                      </button>
                      <button
                        onClick={() => setVerificationDecision(v.id, 'rejected')}
                        className="inline-flex items-center gap-1 rounded-lg bg-white border border-lake-200 px-3 py-1.5 text-xs font-semibold text-lake-700 hover:bg-lake-50"
                      >
                        <X size={13} /> Reject
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Booking status breakdown */}
        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">Bookings by status</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 rounded-lg border border-lake-100 bg-white px-3 py-2">
                <StatusBadge status={status as any} />
                <span className="text-sm font-semibold text-lake-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* All bookings */}
        <div className="mt-8">
          <h2 className="font-semibold text-lake-950">All bookings</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-lake-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lake-100 text-left text-xs text-lake-500">
                  <th className="px-4 py-2 font-medium">Tourist</th>
                  <th className="px-4 py-2 font-medium">Boat</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Hotel</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const boat = boats.find((bt) => bt.id === b.boatId);
                  const hotel = hotels.find((h) => h.id === b.hotelId);
                  return (
                    <tr key={b.id} className="border-b border-lake-50 last:border-0">
                      <td className="px-4 py-2">{b.touristName}</td>
                      <td className="px-4 py-2">{boat?.name}</td>
                      <td className="px-4 py-2">{b.date}</td>
                      <td className="px-4 py-2 text-lake-500">{hotel?.name ?? 'None'}</td>
                      <td className="px-4 py-2">${b.priceTotal}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
