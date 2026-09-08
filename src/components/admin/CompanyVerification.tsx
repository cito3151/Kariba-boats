import { useState } from 'react';
import { Building2, ShieldCheck, ShieldAlert, Eye, Check, X, AlertTriangle } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import * as companies from '../../services/companies.service';
import type {
  CompanyForReview, CompanyDocument, CompanyVerificationStatus,
} from '../../services/companies.service';

const STATUS_CHIP: Record<CompanyVerificationStatus, string> = {
  unverified: 'bg-gray-100 text-gray-700',
  pending: 'bg-amber-100 text-amber-800',
  verified: 'bg-lake-100 text-lake-700',
  rejected: 'bg-red-100 text-red-700',
};

const DOC_CHIP: Record<CompanyDocument['reviewStatus'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-lake-100 text-lake-700',
  rejected: 'bg-red-100 text-red-700',
};

function DocumentRow({ doc, onReviewed }: { doc: CompanyDocument; onReviewed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (status: CompanyDocument['reviewStatus']) => {
    if (status === 'rejected' && !note.trim()) {
      setRejecting(true);
      return;
    }
    setBusy(true); setError(null);
    try {
      await companies.reviewDocument(doc.id, status, note);
      setRejecting(false); setNote('');
      onReviewed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that decision.');
    } finally {
      setBusy(false);
    }
  };

  const view = async () => {
    setError(null);
    try {
      window.open(await companies.signedUrl(doc.storagePath), '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that document.');
    }
  };

  const kindLabel = doc.docKind
    ? companies.DOCUMENT_LABELS[doc.docKind]
    : doc.label || 'Unclassified document';

  return (
    <li className="rounded-lg border border-lake-100 bg-lake-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-lake-950">{kindLabel}</p>
          <p className="truncate text-xs text-lake-500">{doc.fileName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DOC_CHIP[doc.reviewStatus]}`}>
            {doc.reviewStatus}
          </span>
          <button onClick={view}
            className="inline-flex items-center gap-1 rounded-md border border-lake-200 bg-white px-2 py-1 text-xs text-lake-700 hover:bg-lake-50">
            <Eye size={13} /> View
          </button>
          {doc.reviewStatus !== 'approved' && (
            <button onClick={() => act('approved')} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-lake-700 px-2 py-1 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
              <Check size={13} /> Approve
            </button>
          )}
          {doc.reviewStatus !== 'rejected' && (
            <button onClick={() => act('rejected')} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">
              <X size={13} /> Reject
            </button>
          )}
        </div>
      </div>

      {doc.reviewStatus === 'rejected' && doc.reviewNote && !rejecting && (
        <p className="mt-2 text-xs text-red-700">Reason given: {doc.reviewNote}</p>
      )}

      {rejecting && (
        <div className="mt-2">
          <label htmlFor={`note-${doc.id}`} className="text-xs font-medium text-lake-600">
            Tell the operator what to fix
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`note-${doc.id}`} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="For example: the scan is cut off at the bottom"
              className="w-full rounded-lg border border-lake-200 bg-white px-3 py-2 text-sm text-lake-950 outline-none focus:border-lake-400"
            />
            <button onClick={() => act('rejected')} disabled={busy || !note.trim()}
              className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              Reject
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </li>
  );
}

function CompanyCard({ company, onChanged }: { company: CompanyForReview; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: CompanyVerificationStatus) => {
    setBusy(true); setError(null);
    try {
      await companies.reviewCompany(company.id, status, note);
      setNote('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that decision.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Building2 size={18} className="mt-0.5 text-lake-600" />
          <div>
            <h3 className="font-semibold text-lake-950">{company.name}</h3>
            <p className="text-xs text-lake-500">
              {company.registrationNumber ? `Reg ${company.registrationNumber}` : 'No registration number given'}
              {company.contactEmail ? ` · ${company.contactEmail}` : ''}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[company.verificationStatus]}`}>
          {company.verificationStatus}
        </span>
      </div>

      {company.missingKinds.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Still missing: {company.missingKinds.map((k) => companies.DOCUMENT_LABELS[k]).join(', ')}
          </span>
        </p>
      )}

      {company.documents.length === 0 ? (
        <p className="mt-3 rounded-lg bg-lake-50 px-3 py-2 text-sm text-lake-600">
          This company has not uploaded any documents yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {company.documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onReviewed={onChanged} />
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-lake-100 pt-3">
        <label htmlFor={`company-note-${company.id}`} className="text-xs font-medium text-lake-600">
          Note to the operator (optional for verify, expected for reject)
        </label>
        <input
          id={`company-note-${company.id}`} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Visible to the operator on their company page"
          className="mt-1 w-full rounded-lg border border-lake-200 bg-white px-3 py-2 text-sm text-lake-950 outline-none focus:border-lake-400"
        />
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => decide('verified')} disabled={busy || company.approvedCount === 0}
            title={company.approvedCount === 0 ? 'Approve at least one document first' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-lake-700 px-3 py-2 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
            <ShieldCheck size={15} /> Verify company
          </button>
          <button onClick={() => decide('rejected')} disabled={busy || !note.trim()}
            title={!note.trim() ? 'Give a reason first' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
            <ShieldAlert size={15} /> Reject company
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompanyVerification() {
  const { data, loading, error, reload } = useAsync(() => companies.listCompaniesForReview(), []);

  if (loading) return <LoadingState label="Loading companies" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const list = data ?? [];
  if (list.length === 0) {
    return <EmptyState title="No companies yet" hint="Operator companies appear here once owners sign up." />;
  }

  // Anything awaiting a decision floats to the top of the queue.
  const sorted = [...list].sort((a, b) => {
    const rank = (c: CompanyForReview) =>
      c.pendingCount > 0 ? 0 : c.verificationStatus === 'verified' ? 2 : 1;
    return rank(a) - rank(b);
  });

  return (
    <div className="space-y-3">
      {sorted.map((c) => <CompanyCard key={c.id} company={c} onChanged={reload} />)}
    </div>
  );
}
