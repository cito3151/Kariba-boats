import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, AlertCircle, Inbox } from 'lucide-react';
import { loadingFade, staggerItem } from './motion';

// Shared with the public pages (BoatDetail, TouristHome, ProtectedRoute), which keep
// the compact type. The signed-in portal passes `large` for 16px text with AA contrast.
//
// All three sit straight on the page background, so their text is lake-700 or
// darker: it holds AA over the layered lake background (LakeBackdrop), where
// lake-600 and anything paler would not.
//
// The spinner fades in after a short wait, and the empty and error states rise in
// with the same arrival wave as the cards, so whatever replaces a spinner comes
// in with motion instead of a hard swap. Under reduced motion they are drawn at once.

export function LoadingState({ label = 'Loading', large = false }: { label?: string; large?: boolean }) {
  return (
    <motion.div {...loadingFade} className="flex flex-col items-center justify-center gap-2 py-16 text-lake-700">
      <Loader2 size={large ? 28 : 26} className="animate-spin" />
      <p className={large ? 'text-base' : 'text-sm'}>{label}</p>
    </motion.div>
  );
}

/** Props that rise a state view in when it replaces a spinner. */
function useArrive() {
  const reduce = useReducedMotion();
  return { variants: staggerItem, initial: reduce ? false : 'hidden', animate: 'show' } as const;
}

export function ErrorState({ message, onRetry, large = false }: { message: string; onRetry?: () => void; large?: boolean }) {
  const arrive = useArrive();
  return (
    <motion.div {...arrive} className="flex flex-col items-center gap-3 rounded-xl bg-red-50 py-10 px-4 text-center">
      <AlertCircle size={large ? 28 : 24} className="text-red-600" />
      <p className={large ? 'break-words text-base leading-normal text-red-700' : 'text-sm text-red-700'}>{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className={`rounded-lg bg-red-600 font-semibold text-white hover:bg-red-700 ${large ? 'px-4 py-2.5 text-sm' : 'px-4 py-2 text-xs'}`}>
          Try again
        </button>
      )}
    </motion.div>
  );
}

export function EmptyState({ title, hint, action, large = false }: { title: string; hint?: string; action?: ReactNode; large?: boolean }) {
  const arrive = useArrive();
  return (
    <motion.div {...arrive} className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-lake-300 py-14 px-4 text-center">
      <Inbox size={large ? 28 : 24} className="text-lake-600" />
      <p className={large ? 'text-lg font-semibold text-lake-900' : 'font-medium text-lake-800'}>{title}</p>
      {hint && <p className={large ? 'max-w-md text-base leading-normal text-lake-700' : 'text-sm text-lake-700'}>{hint}</p>}
      {action}
    </motion.div>
  );
}
