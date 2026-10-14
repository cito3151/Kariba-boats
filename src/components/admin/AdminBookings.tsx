import { useId, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search } from 'lucide-react';
import StatusBadge from '../StatusBadge';
import BookingFigures from '../BookingFigures';
import BookingRef from '../BookingRef';
import CancelBookingButton from '../CancelBookingButton';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import Reveal from '../Reveal';
import { portalCard } from '../portal/styles';
import { useAsync } from '../../hooks/useAsync';
import * as bookingsSvc from '../../services/bookings.service';

const OPEN = new Set(['requested', 'confirmed', 'deposit_paid']);

export default function AdminBookings() {
  const { data, loading, error, reload } = useAsync(bookingsSvc.listAllBookings, []);
  const reduce = useReducedMotion();
  const searchId = useId();
  const [query, setQuery] = useState('');

  if (loading) return <LoadingState large label="Loading bookings" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;
  const all = data ?? [];
  // References are stored upper case, so a lower-case or partial entry ("7h3q")
  // still finds its booking. Spaces are ignored, as people paste them in.
  const q = query.replace(/\s+/g, '').toUpperCase();
  const rows = q ? all.filter((b) => b.reference.toUpperCase().includes(q)) : all;

  return (
    <div className="space-y-3">
      {all.length > 0 && (
        <div className="sm:max-w-md">
          <label htmlFor={searchId} className="block text-sm font-semibold text-lake-800">Search by booking reference</label>
          {/* White, not lake-50: the search sits on the lake-50 page, not in a card. */}
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-lake-200 bg-white px-3 py-2.5 focus-within:border-lake-500">
            <Search size={16} className="shrink-0 text-lake-600" aria-hidden />
            <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. KLC-7H3QXK" autoComplete="off" spellCheck={false}
              className="w-full min-w-0 bg-transparent font-mono text-base uppercase text-lake-950 outline-none placeholder:normal-case placeholder:font-sans placeholder:text-lake-600" />
          </div>
        </div>
      )}
      {all.length === 0 && (
        <EmptyState large title="No bookings yet" hint="Bookings across the whole platform appear here." />
      )}
      {all.length > 0 && rows.length === 0 && (
        <EmptyState large title="No bookings match" hint="Check the reference and try again. It looks like KLC- and six letters or numbers." />
      )}
      <AnimatePresence>
        {rows.map((b) => (
          // Rises in when the list arrives, or as it scrolls into view.
          <Reveal key={b.id} layout={!reduce}
            exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            className={`${portalCard} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{b.boatName}</h3>
                <BookingRef reference={b.reference} className="mt-1.5" />
              </div>
              <StatusBadge status={b.status} />
            </div>
            <BookingFigures booking={b} />
            {OPEN.has(b.status) && (
              <div className="mt-3.5 border-t border-lake-100 pt-3.5">
                <CancelBookingButton booking={b} onCancelled={reload} />
              </div>
            )}
          </Reveal>
        ))}
      </AnimatePresence>
    </div>
  );
}
