import type { BookingStatus } from '../data/types';

const config: Record<BookingStatus, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmed', className: 'bg-lake-100 text-lake-700' },
  deposit_paid: { label: 'Deposit paid', className: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Completed', className: 'bg-lake-950 text-white' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600' },
};

export default function StatusBadge({ status }: { status: BookingStatus }) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${c.className}`}>
      {c.label}
    </span>
  );
}
