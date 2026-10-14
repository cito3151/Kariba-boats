import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';
import { formatLongDate, useAccountDeletion } from '../hooks/useAccountDeletion';

/**
 * The reminder under the site header while the signed-in user's account is due
 * to be deleted (migration 33's 30-day window). It shows on every page, so it is
 * the first thing they see after signing in, and offers Cancel deletion in place.
 * The Account page has its own, fuller panel, so the banner stays off that page.
 *
 * amber-950 on amber-50 is over 15:1; the button is navy on white.
 */
export default function AccountDeletionBanner() {
  const reduce = useReducedMotion();
  const location = useLocation();
  const { status, pending, cancel } = useAccountDeletion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const show = pending && !!status && location.pathname !== '/account';

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the deletion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="deletion-banner"
          role="region"
          aria-label="Account deletion"
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.24, ease: 'easeOut' }}
          className="overflow-hidden border-b border-amber-200 bg-amber-50"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="flex items-start gap-2.5 text-[15px] leading-snug text-amber-950">
              <CalendarClock size={18} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />
              <span>
                Your account is due to be deleted on <strong className="font-bold">{formatLongDate(status!.scheduledFor)}</strong>.
                {' '}Until then you can cancel.
                {error && <span role="alert" className="block text-red-800">{error}</span>}
              </span>
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void undo()}
                disabled={busy}
                className="inline-flex min-h-10 items-center rounded-lg border border-lake-300 bg-white px-3.5 py-2 text-sm font-bold text-lake-950 outline-none transition-colors hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {busy ? 'Cancelling' : 'Cancel deletion'}
              </button>
              <Link
                to="/account"
                className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-semibold text-amber-950 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500"
              >
                Account
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
