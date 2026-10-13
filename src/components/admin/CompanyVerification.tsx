import { useEffect, useRef, useState } from 'react';
import { Building2, ShieldCheck, ShieldAlert, Eye, Check, X, AlertTriangle } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '../StateViews';
import { portalCard, portalButtonSecondary, portalButtonDanger } from '../portal/styles';
import { adminButtonCommit, adminButtonConfirmReject } from './styles';
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
  const noteRef = useRef<HTMLInputElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  // The note panel appears well below the button that opened it, so without moving
  // focus a screen-reader user gets no signal that anything happened. Cancelling
  // hands focus back rather than dropping it on the body.
  useEffect(() => {
    if (rejecting) { noteRef.current?.focus(); return; }
    if (returnFocus.current) { returnFocus.current = false; rejectRef.current?.focus(); }
  }, [rejecting]);

  const cancelReject = () => {
    returnFocus.current = true;
    setRejecting(false); setNote(''); setError(null);
  };

  const act = async (status: CompanyDocument['reviewStatus']) => {
    if (status === 'rejected' && !note.trim()) {
      setRejecting(true);
      return;
    }
    setBusy(true); setError(null);
    try {
      // The note box belongs to the rejection flow. Sending it on an approval would
      // file "the scan is cut off" against a document the admin then decided was fine.
      await companies.reviewDocument(doc.id, status, status === 'rejected' ? note : undefined);
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
      await companies.openDocument(doc.storagePath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that document.');
    }
  };

  const kindLabel = doc.docKind
    ? companies.DOCUMENT_LABELS[doc.docKind]
    : doc.label || 'Unclassified document';

  return (
    <li className="rounded-lg border border-lake-100 bg-lake-50 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-lake-950">{kindLabel}</p>
          <p className="truncate text-[15px] text-lake-700">{doc.fileName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${DOC_CHIP[doc.reviewStatus]}`}>
            {doc.reviewStatus}
          </span>
          <button onClick={view} className={portalButtonSecondary}>
            <Eye size={15} /> View
          </button>
          {/* Hidden while the note panel is open: otherwise this Reject becomes a
              second live submit once a note exists, and the card carries two
              controls with the same label in different places. */}
          {!rejecting && doc.reviewStatus !== 'approved' && (
            <button onClick={() => act('approved')} disabled={busy} className={adminButtonCommit}>
              <Check size={15} /> Approve
            </button>
          )}
          {!rejecting && doc.reviewStatus !== 'rejected' && (
            <button ref={rejectRef} onClick={() => act('rejected')} disabled={busy} className={portalButtonDanger}>
              <X size={15} /> Reject
            </button>
          )}
        </div>
      </div>

      {doc.reviewStatus === 'rejected' && doc.reviewNote && !rejecting && (
        <p className="mt-2 break-words text-[15px] leading-normal text-red-700">Reason given: {doc.reviewNote}</p>
      )}

      {rejecting && (
        <div className="mt-2">
          <label htmlFor={`note-${doc.id}`} className="block text-sm font-medium text-lake-700">
            Tell the operator what to fix
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              ref={noteRef}
              id={`note-${doc.id}`} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="For example: the scan is cut off at the bottom"
              className="w-full min-w-0 flex-1 rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500 sm:w-auto"
            />
            <button onClick={() => act('rejected')} disabled={busy || !note.trim()}
              className={`${adminButtonConfirmReject} shrink-0`}>
              Confirm rejection
            </button>
            <button onClick={cancelReject} disabled={busy} className={`${portalButtonSecondary} shrink-0`}>
              Cancel
            </button>
          </div>
          {/* A disabled button is out of the tab order and fires no tooltip, so the
              reason it is unavailable belongs on the page. */}
          {!note.trim() && (
            <p className="mt-1.5 text-[15px] text-lake-700">Write what needs fixing before you can reject this document.</p>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[15px] font-medium text-red-700">{error}</p>}
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
      // Same reasoning as the per-document note: a verify carries no rejection text.
      await companies.reviewCompany(company.id, status, status === 'rejected' ? note : undefined);
      setNote('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that decision.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${portalCard} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Building2 size={20} className="mt-0.5 shrink-0 text-lake-600" aria-hidden />
          <div className="min-w-0">
            <h3 className="break-words text-lg font-bold leading-snug tracking-[-0.01em] text-lake-950">{company.name}</h3>
            <p className="mt-0.5 break-words text-[15px] leading-normal text-lake-700">
              {company.registrationNumber ? `Reg ${company.registrationNumber}` : 'No registration number given'}
              {company.contactEmail ? ` · ${company.contactEmail}` : ''}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_CHIP[company.verificationStatus]}`}>
          {company.verificationStatus}
        </span>
      </div>

      {company.missingKinds.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[15px] leading-normal text-amber-900">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            Still missing: {company.missingKinds.map((k) => companies.DOCUMENT_LABELS[k]).join(', ')}
          </span>
        </p>
      )}

      {company.documents.length === 0 ? (
        <p className="mt-3 rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] leading-normal text-lake-700">
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
        <label htmlFor={`company-note-${company.id}`} className="block text-sm font-medium text-lake-700">
          Note to the operator (optional for verify, expected for reject)
        </label>
        <input
          id={`company-note-${company.id}`} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Visible to the operator on their company page"
          className="mt-1 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500"
        />
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Mirrors admin_review_company's gate exactly, so the button is never
              offered for a decision the database will refuse. */}
          <button onClick={() => decide('verified')} disabled={busy || company.awaitingApproval.length > 0}
            className={adminButtonCommit}>
            <ShieldCheck size={16} /> Verify company
          </button>
          {company.awaitingApproval.length > 0 && (
            <p className="w-full text-[15px] leading-normal text-lake-700">
              Every proof must be approved before this company can be verified. Outstanding:{' '}
              {company.awaitingApproval.map((k) => companies.DOCUMENT_LABELS[k]).join(', ')}.
            </p>
          )}
          <button onClick={() => decide('rejected')} disabled={busy || !note.trim()} className={portalButtonDanger}>
            <ShieldAlert size={16} /> Reject company
          </button>
          {/* A title on a disabled button reaches nobody: it is out of the tab order
              and does not reliably fire a tooltip. */}
          {!note.trim() && (
            <p className="w-full text-[15px] leading-normal text-lake-700">Add a note above before rejecting this company.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CompanyVerification({ onReviewed }: { onReviewed?: () => void }) {
  const { data, loading, error, reload } = useAsync(() => companies.listCompaniesForReview(), []);

  // The dashboard tile counts the same queue from its own narrower query, so it has
  // to be told when a decision lands or it keeps its pre-review number.
  const refresh = () => { reload(); onReviewed?.(); };

  if (loading) return <LoadingState large label="Loading companies" />;
  if (error) return <ErrorState large message={error} onRetry={reload} />;

  const list = data ?? [];
  if (list.length === 0) {
    return <EmptyState large title="No companies yet" hint="Operator companies appear here once owners sign up." />;
  }

  // Anything awaiting a decision floats to the top of the queue.
  const sorted = [...list].sort((a, b) => {
    const rank = (c: CompanyForReview) =>
      c.pendingCount > 0 ? 0 : c.verificationStatus === 'verified' ? 2 : 1;
    return rank(a) - rank(b);
  });

  return (
    <div className="space-y-3">
      {sorted.map((c) => <CompanyCard key={c.id} company={c} onChanged={refresh} />)}
    </div>
  );
}
