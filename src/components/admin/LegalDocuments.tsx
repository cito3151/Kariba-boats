import { useState } from 'react';
import { LoadingState, ErrorState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import { listCurrentDocuments, publishDocument, type LegalDocument } from '../../services/legal.service';

function Editor({ doc, onPublished }: { doc: LegalDocument; onPublished: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const publish = async () => {
    setBusy(true); setMsg('');
    try {
      await publishDocument({
        docType: doc.docType, title, body,
        isRequired: doc.isRequired, appliesToRoles: doc.appliesToRoles,
      });
      setMsg('Published. This is now version ' + (doc.version + 1) + '.');
      onPublished();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lake-950">{doc.docType}</h3>
        <span className="text-xs text-lake-500">current v{doc.version}{doc.isRequired ? ' · required' : ''}</span>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        className="mt-2 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8}
        className="mt-2 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm font-mono" />
      {doc.isRequired && (
        <p className="mt-2 text-xs text-amber-700">
          Publishing a new version of a required document asks every applicable user to accept it again on their next visit.
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-lake-600">{msg}</p>}
      <button onClick={publish} disabled={busy}
        className="mt-2 rounded-lg bg-lake-700 px-4 py-2 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-60">
        {busy ? 'Publishing' : 'Publish new version'}
      </button>
    </div>
  );
}

export default function LegalDocuments() {
  const { data, loading, error, reload } = useAsync(listCurrentDocuments, []);
  const docs = data ?? [];
  if (loading) return <LoadingState label="Loading documents" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-3">
      {docs.map((d) => <Editor key={d.docType} doc={d} onPublished={reload} />)}
    </div>
  );
}
