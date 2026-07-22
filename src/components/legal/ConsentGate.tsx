import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../data/AuthContext';
import { outstandingConsents, recordConsent, type OutstandingConsent } from '../../services/legal.service';

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const { currentUser, logout } = useAuth();
  const [items, setItems] = useState<OutstandingConsent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    if (!currentUser) { setItems([]); return; }
    setItems(null);
    outstandingConsents().then(setItems).catch(() => setItems([]));
  }, [currentUser]);

  useEffect(() => { refresh(); }, [refresh]);

  // Logged out, or no outstanding consents: the app runs normally.
  if (!currentUser || (items !== null && items.length === 0)) return <>{children}</>;

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
            Read and accept the documents below to continue using Kariba Lake Access.
          </p>
          {items.map((it) => (
            <div key={it.docType} className="rounded-xl border border-lake-100 p-3">
              <h3 className="text-sm font-semibold text-lake-900">{it.title}</h3>
              <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-lake-600">{it.body}</div>
            </div>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="border-t border-lake-100 px-5 py-3">
          <button onClick={acceptAll} disabled={busy}
            className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 disabled:opacity-60">
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
