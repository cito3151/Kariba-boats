import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LoadingState, ErrorState } from '../StateViews';
import { portalCard } from '../portal/styles';
import { adminButtonCommit } from './styles';
import { useAsync } from '../../hooks/useAsync';
import { listCurrentDocuments, publishDocument, type LegalDocument } from '../../services/legal.service';
import { staggerContainer, staggerItem } from '../motion';

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
    <motion.div variants={staggerItem} className={`${portalCard} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{doc.docType}</h3>
        <span className="text-sm font-medium tabular-nums text-lake-700">current v{doc.version}{doc.isRequired ? ' · required' : ''}</span>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={`${doc.docType} title`}
        className="mt-3 w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} aria-label={`${doc.docType} text`}
        className="mt-2 w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base font-mono text-lake-950 outline-none focus:border-lake-500" />
      {doc.isRequired && (
        <p className="mt-2 text-[15px] leading-normal text-amber-800">
          Publishing a new version of a required document asks every applicable user to accept it again on their next visit.
        </p>
      )}
      {msg && <p className="mt-2 text-[15px] font-medium text-lake-700">{msg}</p>}
      <button onClick={publish} disabled={busy} className={`${adminButtonCommit} mt-3`}>
        {busy ? 'Publishing' : 'Publish new version'}
      </button>
    </motion.div>
  );
}

export default function LegalDocuments() {
  const { data, loading, error, reload } = useAsync(listCurrentDocuments, []);
  const docs = data ?? [];
  const reduce = useReducedMotion();
  if (loading) return <LoadingState large label="Loading documents" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;
  return (
    <motion.div variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show" className="space-y-3">
      {docs.map((d) => <Editor key={d.docType} doc={d} onPublished={reload} />)}
    </motion.div>
  );
}
