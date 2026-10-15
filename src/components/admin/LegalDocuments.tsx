import { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LoadingState, ErrorState } from '../StateViews';
import { portalCard, portalButtonSecondary } from '../portal/styles';
import { adminButtonCommit } from './styles';
import LegalMarkdown from '../legal/LegalMarkdown';
import { parseLegalMarkdown } from '../legal/parseLegalMarkdown';
import { useAsync } from '../../hooks/useAsync';
import {
  listCurrentDocuments, listDocumentVersions, publishDocument,
  LEGAL_DOC_LABELS, LEGAL_ROLES, NEVER_REQUIRED, type LegalDocument,
} from '../../services/legal.service';
import { staggerContainer, staggerItem } from '../motion';

const ROLE_LABELS: Record<(typeof LEGAL_ROLES)[number], string> = {
  tourist: 'Guests', owner: 'Boat operators', hotel: 'Hotels', agency: 'Travel agencies', admin: 'Administrators',
};

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFormat.format(d);
}

function audienceText(roles: string[] | null) {
  if (!roles) return 'everyone';
  return roles.map((r) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r).join(', ');
}

function sameRoles(a: string[] | null, b: string[] | null) {
  if (a === null || b === null) return a === b;
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

const inputClass =
  'mt-1 w-full rounded-lg border border-lake-200 bg-lake-50 px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';
const labelClass = 'block text-sm font-medium text-lake-700';
const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-lake-500 ${
    active ? 'bg-white text-lake-950 shadow-[0_1px_2px_rgb(13_37_50/0.12)]' : 'text-lake-700 hover:text-lake-950'}`;

function Editor({ doc, onPublished }: { doc: LegalDocument; onPublished: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const canRequire = !NEVER_REQUIRED.has(doc.docType);
  const [isRequired, setIsRequired] = useState(canRequire && doc.isRequired);
  const [roles, setRoles] = useState<string[] | null>(doc.appliesToRoles);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgIsError, setMsgIsError] = useState(false);
  const ids = { title: useId(), body: useId(), required: useId(), audience: useId(), panel: useId() };

  const blocks = useMemo(() => (view === 'preview' ? parseLegalMarkdown(body).blocks : []), [view, body]);
  const label = LEGAL_DOC_LABELS[doc.docType] ?? doc.docType;
  const nextVersion = doc.version + 1;
  const dirty = title !== doc.title || body !== doc.body
    || isRequired !== doc.isRequired || !sameRoles(roles, doc.appliesToRoles);
  const problem = !title.trim() || !body.trim()
    ? 'A document needs a title and text.'
    : roles !== null && roles.length === 0
      ? 'Choose at least one role, or apply the document to everyone.'
      : '';

  const toggleRole = (role: string, on: boolean) => {
    setRoles((cur) => {
      const list = cur ?? [];
      return on ? [...new Set([...list, role])] : list.filter((r) => r !== role);
    });
  };

  const publish = async () => {
    setBusy(true); setMsg('');
    try {
      await publishDocument({ docType: doc.docType, title: title.trim(), body, isRequired, appliesToRoles: roles });
      setConfirming(false);
      setMsgIsError(false);
      setMsg(`Published. This is now version ${nextVersion}.`);
      onPublished();
    } catch (err) {
      setMsgIsError(true);
      setMsg(err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div variants={staggerItem} className={`${portalCard} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{label}</h3>
        <span className="text-sm font-medium tabular-nums text-lake-700">
          current v{doc.version} · {doc.isRequired ? 'required' : 'optional'} · {audienceText(doc.appliesToRoles)}
        </span>
      </div>

      <label htmlFor={ids.title} className={`${labelClass} mt-3`}>Title</label>
      <input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={ids.body} className={labelClass}>Text (Markdown)</label>
        <div role="group" aria-label="Edit or preview the text" className="inline-flex gap-1 rounded-lg bg-lake-100 p-1">
          <button type="button" aria-pressed={view === 'edit'} onClick={() => setView('edit')} className={tabClass(view === 'edit')}>Edit</button>
          <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')} className={tabClass(view === 'preview')}>Preview</button>
        </div>
      </div>
      {view === 'edit' ? (
        <textarea id={ids.body} value={body} onChange={(e) => setBody(e.target.value)} rows={10}
          className={`${inputClass} font-mono`} />
      ) : (
        <div className="mt-1 rounded-lg border border-lake-200 bg-white px-4 py-5 sm:px-6">
          <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.05em] text-lake-700">Preview, as on the page</p>
          <p className="mb-6 break-words text-[1.5rem] font-bold leading-tight text-lake-950">{title || 'Untitled'}</p>
          {blocks.length > 0
            ? <LegalMarkdown blocks={blocks} />
            : <p className="text-base text-lake-700">There is no text to preview yet.</p>}
        </div>
      )}

      <fieldset className="mt-4 space-y-3 rounded-lg border border-lake-100 p-3.5">
        <legend className="px-1 text-sm font-medium text-lake-700">Settings for version {nextVersion}</legend>
        <div>
          <label className={`flex items-start gap-2.5 text-base ${canRequire ? 'text-lake-900' : 'text-lake-700'}`}>
            <input type="checkbox" checked={isRequired} disabled={!canRequire} aria-describedby={ids.required}
              onChange={(e) => setIsRequired(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded accent-lake-700" />
            Users must accept this version
          </label>
          <p id={ids.required} className="mt-1 pl-[1.875rem] text-sm leading-normal text-lake-700">
            {canRequire
              ? 'Everyone it applies to is asked to accept it on their next visit, and cannot carry on until they do.'
              : doc.docType === 'marketing'
                ? 'Marketing consent is always optional.'
                : 'The waiver is accepted with each booking, so it is never required on its own.'}
          </p>
        </div>
        <div role="radiogroup" aria-labelledby={ids.audience}>
          <p id={ids.audience} className="text-sm font-medium text-lake-700">Applies to</p>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-base text-lake-900">
              <input type="radio" name={`${ids.audience}-scope`} checked={roles === null}
                onChange={() => setRoles(null)} className="h-5 w-5 accent-lake-700" />
              Everyone
            </label>
            <label className="flex items-center gap-2 text-base text-lake-900">
              <input type="radio" name={`${ids.audience}-scope`} checked={roles !== null}
                onChange={() => setRoles(doc.appliesToRoles ?? [])} className="h-5 w-5 accent-lake-700" />
              Only some roles
            </label>
          </div>
          {roles !== null && (
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 pl-1">
              {LEGAL_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-base text-lake-900">
                  <input type="checkbox" checked={roles.includes(r)} onChange={(e) => toggleRole(r, e.target.checked)}
                    className="h-5 w-5 rounded accent-lake-700" />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      {problem && dirty && <p className="mt-3 text-[15px] leading-normal text-red-700">{problem}</p>}
      {msg && (
        <p role={msgIsError ? 'alert' : 'status'}
          className={`mt-3 text-[15px] font-medium leading-normal ${msgIsError ? 'text-red-700' : 'text-lake-700'}`}>{msg}</p>
      )}

      {confirming ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-base leading-relaxed text-lake-950">
            Publish <strong className="font-bold">{label}</strong> version {nextVersion}, {isRequired ? 'required' : 'optional'}, for {audienceText(roles)}?
            {' '}Published versions cannot be edited or withdrawn; a correction is another new version.
            {isRequired && ' Everyone it applies to will be asked to accept it on their next visit.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={publish} disabled={busy} className={adminButtonCommit}>
              {busy ? 'Publishing' : `Publish version ${nextVersion}`}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={portalButtonSecondary}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setMsg(''); setConfirming(true); }} disabled={!dirty || !!problem}
          className={`${adminButtonCommit} mt-3`}>
          Publish new version
        </button>
      )}

      <VersionHistory docType={doc.docType} reloadKey={doc.version} />
    </motion.div>
  );
}

/** Read-only list of every published version of one document type. */
function VersionHistory({ docType, reloadKey }: { docType: LegalDocument['docType']; reloadKey: number }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const panelId = useId();
  const { data, loading, error, reload } = useAsync(
    () => (open ? listDocumentVersions(docType) : Promise.resolve(null)), [docType, open, reloadKey],
  );

  return (
    <div className="mt-4 border-t border-lake-100 pt-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="inline-flex min-h-8 items-center gap-1 rounded-sm text-sm font-semibold text-lake-700 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
        {open ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
        Version history
      </button>
      {open && (
        <div id={panelId} className="mt-2">
          {loading && !data && <LoadingState large label="Loading versions" />}
          {error && <ErrorState large message={error} onRetry={reload} />}
          {data && (
            <ol className="divide-y divide-lake-100 rounded-lg border border-lake-100">
              {data.map((v) => (
                <li key={v.id} className="px-3.5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 break-words text-base text-lake-950">
                      <span className="font-semibold tabular-nums">v{v.version}</span> · {v.title}
                    </p>
                    {v.isCurrent && (
                      <span className="rounded-full bg-lake-100 px-2.5 py-0.5 text-[13px] font-semibold text-lake-800">Current</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-lake-700">
                    Published {formatDate(v.publishedAt)} · {v.isRequired ? 'required' : 'optional'} · {audienceText(v.appliesToRoles)}
                  </p>
                  <button type="button" onClick={() => setShown((s) => (s === v.id ? null : v.id))}
                    aria-expanded={shown === v.id}
                    className="mt-1 inline-flex min-h-8 items-center rounded-sm text-sm font-semibold text-lake-700 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500">
                    {shown === v.id ? 'Hide text' : 'Show text'}<span className="sr-only">, version {v.version}</span>
                  </button>
                  {shown === v.id && (
                    <div className="mt-2 max-h-80 overflow-y-auto rounded-lg bg-lake-50 px-3.5 py-3">
                      <LegalMarkdown blocks={parseLegalMarkdown(v.body).blocks} variant="compact" />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export default function LegalDocuments() {
  const { data, loading, error, reload } = useAsync(listCurrentDocuments, []);
  const docs = data ?? [];
  const reduce = useReducedMotion();
  if (loading && !data) return <LoadingState large label="Loading documents" />;
  if (error && !data) return <ErrorState large message={error} onRetry={reload} />;
  return (
    <motion.div variants={staggerContainer} initial={reduce ? false : 'hidden'} animate="show" className="space-y-3">
      {docs.map((d) => <Editor key={d.docType} doc={d} onPublished={reload} />)}
    </motion.div>
  );
}
