import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../data/AuthContext';
import { outstandingConsents, recordConsent, type OutstandingConsent } from '../../services/legal.service';
import LegalMarkdown from './LegalMarkdown';
import { parseLegalMarkdown } from './parseLegalMarkdown';

// The documents that have their own public page, opened from the gate in a new
// tab. Those two pages are never gated themselves, so they can be read there.
const FULL_PAGE: Partial<Record<OutstandingConsent['docType'], string>> = {
  terms: '/terms',
  privacy: '/privacy',
};

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const { currentUser, logout } = useAuth();
  const { pathname } = useLocation();
  const [items, setItems] = useState<OutstandingConsent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    if (!currentUser) { setItems([]); return; }
    setItems(null);
    outstandingConsents().then(setItems).catch(() => setItems([]));
  }, [currentUser]);

  useEffect(() => { refresh(); }, [refresh]);

  // Logged out, or no outstanding consents: the app runs normally. The terms and
  // privacy pages are always readable, so the documents can be read in full
  // before they are accepted.
  if (!currentUser || (items !== null && items.length === 0)) return <>{children}</>;
  if (Object.values(FULL_PAGE).includes(pathname)) return <>{children}</>;

  // Signed in but still resolving outstanding consents. Hold the app behind a
  // brief loader so a gated action (for example an owner submitting a boat)
  // cannot slip through before the gate has a chance to appear.
  if (items === null) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white">
        <Loader2 size={28} className="animate-spin text-lake-500" />
      </div>
    );
  }

  const acceptAll = async () => {
    setBusy(true); setError('');
    try {
      for (const it of items) {
        await recordConsent({ docType: it.docType, version: it.version, context: 're_consent' });
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your acceptance.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-lake-950/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-lake-100 px-5 py-4">
          <ShieldCheck className="text-lake-700" size={20} />
          <h2 className="font-semibold text-lake-950">Please review our terms</h2>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-lake-600">
            Read and accept the documents below to continue using Kariba Lake Connect.
          </p>
          {items.map((it) => {
            const page = FULL_PAGE[it.docType];
            return (
              <div key={it.docType} className="rounded-xl border border-lake-100 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-lake-900">{it.title}</h3>
                  {page && (
                    <Link to={page} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-sm text-[13px] font-semibold text-lake-700 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
                      Read the full page<span className="sr-only"> for {it.title} (opens in a new tab)</span>
                      <ExternalLink size={13} aria-hidden />
                    </Link>
                  )}
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto pr-1">
                  <LegalMarkdown blocks={parseLegalMarkdown(it.body).blocks} variant="compact" />
                </div>
              </div>
            );
          })}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="border-t border-lake-100 px-5 py-3">
          <button onClick={acceptAll} disabled={busy}
            className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-lake-950 hover:bg-sunset-400 disabled:opacity-60">
            {busy ? 'Recording' : 'I accept'}
          </button>
          <button onClick={() => logout()} disabled={busy}
            className="mt-2 w-full text-center text-xs text-lake-500 hover:text-lake-700 disabled:opacity-60">
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
