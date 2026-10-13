import type { ReactNode } from 'react';
import { Loader2, AlertCircle, Inbox } from 'lucide-react';

// Shared with the public pages (BoatDetail, TouristHome, ProtectedRoute), which keep
// the compact type. The signed-in portal passes `large` for 16px text with AA contrast.

export function LoadingState({ label = 'Loading', large = false }: { label?: string; large?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-16 ${large ? 'text-lake-600' : 'text-lake-500'}`}>
      <Loader2 size={large ? 28 : 26} className="animate-spin" />
      <p className={large ? 'text-base' : 'text-sm'}>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry, large = false }: { message: string; onRetry?: () => void; large?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-red-50 py-10 px-4 text-center">
      <AlertCircle size={large ? 28 : 24} className="text-red-600" />
      <p className={large ? 'break-words text-base leading-normal text-red-700' : 'text-sm text-red-700'}>{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className={`rounded-lg bg-red-600 font-semibold text-white hover:bg-red-700 ${large ? 'px-4 py-2.5 text-sm' : 'px-4 py-2 text-xs'}`}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action, large = false }: { title: string; hint?: string; action?: ReactNode; large?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-lake-200 py-14 px-4 text-center">
      <Inbox size={large ? 28 : 24} className={large ? 'text-lake-500' : 'text-lake-300'} />
      <p className={large ? 'text-lg font-semibold text-lake-900' : 'font-medium text-lake-800'}>{title}</p>
      {hint && <p className={large ? 'max-w-md text-base leading-normal text-lake-600' : 'text-sm text-lake-500'}>{hint}</p>}
      {action}
    </div>
  );
}
