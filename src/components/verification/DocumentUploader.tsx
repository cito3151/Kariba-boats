import { useRef, useState } from 'react';
import { FileText, Trash2, Upload, ExternalLink } from 'lucide-react';
import { LoadingState, ErrorState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../data/AuthContext';
import { portalCard, portalButtonSecondary, portalButtonDanger } from '../portal/styles';
import {
  listMyDocuments, uploadDocuments, deleteDocument, openDocument,
  type VerificationDocument,
} from '../../services/documents.service';

export default function DocumentUploader() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => listMyDocuments(userId), [userId]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const docs = data ?? [];

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true); setMsg('');
    try {
      await uploadDocuments(userId, files.map((file) => ({ file, label })));
      setLabel('');
      if (fileRef.current) fileRef.current.value = '';
      reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not upload.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc: VerificationDocument) => {
    setBusy(true); setMsg('');
    try { await deleteDocument(doc); reload(); }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not delete.'); }
    finally { setBusy(false); }
  };

  const view = async (doc: VerificationDocument) => {
    setMsg('');
    try { await openDocument(doc.storagePath); }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not open the document.'); }
  };

  return (
    // An h2: on every page that shows it (owner, hotel and agency portals) it sits
    // straight under the page's h1, not inside a PortalSection.
    <div className={`${portalCard} p-4 sm:p-5`}>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-lake-950">
        <FileText size={18} aria-hidden /> Business documents
      </h2>
      <p className="mt-1.5 text-[15px] leading-normal text-lake-700">
        Upload your company registration documents (PDF, JPEG, or PNG). Our team reviews these
        before your account is verified and your boats can go live.
      </p>

      {loading && <LoadingState large label="Loading documents" />}
      {error && <ErrorState large message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {docs.length > 0 && (
            <ul className="mt-3 space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-lake-50 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-lake-900">{d.label || d.fileName}</p>
                    <p className="truncate text-sm text-lake-700">{d.fileName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => view(d)} className={portalButtonSecondary}>
                      <ExternalLink size={15} /> View
                    </button>
                    <button onClick={() => remove(d)} disabled={busy}
                      aria-label={`Delete ${d.label || d.fileName}`}
                      className={portalButtonDanger}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="document-label" className="block text-sm font-medium text-lake-700">Label (optional)</label>
              <input id="document-label" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Certificate of incorporation"
                className="mt-1.5 w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base outline-none focus:border-lake-500" />
            </div>
            {/* A button rather than a <label> around the input: the input must be
                display:none to hide the browser's own control, which also drops it
                from the tab order, and a <label> cannot take focus itself. Outlined:
                the owner portal shows this card under its orange Register a boat. */}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className={portalButtonSecondary}>
              <Upload size={16} /> {busy ? 'Uploading' : 'Upload'}
            </button>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" multiple
              className="hidden" tabIndex={-1} aria-hidden="true" onChange={onPick} disabled={busy} />
          </div>
          {msg && <p role="alert" className="mt-2 text-[15px] font-medium text-red-700">{msg}</p>}
        </>
      )}
    </div>
  );
}
