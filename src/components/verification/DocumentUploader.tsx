import { useRef, useState } from 'react';
import { FileText, Trash2, Upload, ExternalLink } from 'lucide-react';
import { LoadingState, ErrorState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../data/AuthContext';
import {
  listMyDocuments, uploadDocuments, deleteDocument, signedUrl,
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
    try { window.open(await signedUrl(doc.storagePath), '_blank', 'noopener'); }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not open the document.'); }
  };

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4">
      <h3 className="flex items-center gap-1.5 font-semibold text-lake-950">
        <FileText size={16} /> Business documents
      </h3>
      <p className="mt-1 text-xs text-lake-500">
        Upload your company registration documents (PDF, JPEG, or PNG). Our team reviews these
        before your account is verified and your boats can go live.
      </p>

      {loading && <LoadingState label="Loading documents" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {docs.length > 0 && (
            <ul className="mt-3 space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-lake-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-lake-900">{d.label || d.fileName}</p>
                    <p className="truncate text-xs text-lake-500">{d.fileName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => view(d)} className="inline-flex items-center gap-1 text-xs font-semibold text-lake-700 hover:text-lake-900">
                      <ExternalLink size={13} /> View
                    </button>
                    <button onClick={() => remove(d)} disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="text-xs font-medium text-lake-500">Label (optional)</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Certificate of incorporation"
                className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400" />
            </div>
            <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-lake-700 px-4 py-2 text-xs font-semibold text-white hover:bg-lake-800 ${busy ? 'opacity-60' : ''}`}>
              <Upload size={14} /> {busy ? 'Uploading' : 'Upload'}
              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" multiple
                className="hidden" onChange={onPick} disabled={busy} />
            </label>
          </div>
          {msg && <p className="mt-2 text-xs text-red-600">{msg}</p>}
        </>
      )}
    </div>
  );
}
