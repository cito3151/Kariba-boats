import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, ShieldCheck, Clock, ShieldAlert, Upload, Trash2, Eye, ArrowLeft, CheckCircle2,
} from 'lucide-react';
import PageTransition from '../../components/PageTransition';
import DashboardBanner from '../../components/DashboardBanner';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../data/AuthContext';
import { photos } from '../../data/photos';
import * as companies from '../../services/companies.service';
import type {
  Company, CompanyDocument, DocumentKind, CompanyVerificationStatus,
} from '../../services/companies.service';

const STATUS_VIEW: Record<CompanyVerificationStatus, { label: string; chip: string; blurb: string }> = {
  unverified: {
    label: 'Not yet submitted',
    chip: 'bg-gray-100 text-gray-700',
    blurb: 'Upload the four proofs below so an administrator can verify your company.',
  },
  pending: {
    label: 'Under review',
    chip: 'bg-amber-100 text-amber-800',
    blurb: 'An administrator is checking your documents. You can keep working in the meantime.',
  },
  verified: {
    label: 'Verified',
    chip: 'bg-lake-100 text-lake-700',
    blurb: 'Your company is verified. Tourists see the verified badge on your listings.',
  },
  rejected: {
    label: 'Not approved',
    chip: 'bg-red-100 text-red-700',
    blurb: 'An administrator could not verify your company from the documents on file.',
  },
};

const DOC_STATUS_CHIP: Record<CompanyDocument['reviewStatus'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-lake-100 text-lake-700',
  rejected: 'bg-red-100 text-red-700',
};

function DocumentSlot({
  kind, label, hint, documents, companyId, userId, onChanged,
}: {
  kind: DocumentKind; label: string; hint: string;
  documents: CompanyDocument[]; companyId: string; userId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mine = documents.filter((d) => d.docKind === kind);
  const best = mine.find((d) => d.reviewStatus === 'approved') ?? mine[0] ?? null;
  const uploadLabel = busy ? 'Uploading' : mine.length > 0 ? 'Upload another' : 'Upload document';

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      await companies.uploadDocument({ companyId, userId, kind, file });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc: CompanyDocument) => {
    setBusy(true); setError(null);
    try {
      await companies.deleteDocument(doc);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that document.');
    } finally {
      setBusy(false);
    }
  };

  const view = async (doc: CompanyDocument) => {
    setError(null);
    try {
      await companies.openDocument(doc.storagePath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that document.');
    }
  };

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[1.0625rem] font-semibold leading-snug text-lake-950">{label}</h3>
          <p className="mt-1 text-[15px] leading-normal text-lake-700">{hint}</p>
        </div>
        {best ? (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${DOC_STATUS_CHIP[best.reviewStatus]}`}>
            {best.reviewStatus === 'approved' ? 'Approved'
              : best.reviewStatus === 'rejected' ? 'Rejected' : 'Awaiting review'}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-[13px] font-semibold text-gray-700">
            Not uploaded
          </span>
        )}
      </div>

      {mine.length > 0 && (
        <ul className="mt-3 space-y-2">
          {mine.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-lake-50 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-lake-900">{doc.fileName}</p>
                {doc.reviewStatus === 'rejected' && doc.reviewNote && (
                  <p className="text-[15px] leading-normal text-red-700">Administrator: {doc.reviewNote}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => view(doc)}
                  className="inline-flex items-center gap-1 rounded-md border border-lake-200 px-3 py-2 text-sm font-semibold text-lake-700 hover:bg-white">
                  <Eye size={15} /> View
                </button>
                {doc.reviewStatus !== 'approved' && (
                  <button onClick={() => remove(doc)} disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={15} /> Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* A real button, not a <label> around the input: the input has to be
          display:none to hide the browser's own control, and that takes it out of
          the tab order, while a <label> is not focusable at all. Keyboard users
          could reach View and Remove but never the upload itself. */}
      <button
        type="button" onClick={() => fileRef.current?.click()} disabled={busy}
        aria-label={`${uploadLabel} for ${label}`}
        aria-describedby={`upload-hint-${kind}`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-lake-200 px-3.5 py-2.5 text-sm font-semibold text-lake-700 outline-none hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        <Upload size={16} />
        {uploadLabel}
      </button>
      <input
        ref={fileRef} type="file" className="hidden" tabIndex={-1} aria-hidden="true" disabled={busy}
        accept="application/pdf,image/jpeg,image/png"
        onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }}
      />
      <p id={`upload-hint-${kind}`} className="mt-2 text-sm text-lake-700">PDF, JPEG or PNG, up to 10 MB.</p>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>
      )}
    </div>
  );
}

function CompanyDetails({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [name, setName] = useState(company.name);
  const [registrationNumber, setRegistrationNumber] = useState(company.registrationNumber ?? '');
  const [contactEmail, setContactEmail] = useState(company.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(company.contactPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      await companies.updateCompany(company.id, { name, registrationNumber, contactEmail, contactPhone });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1.5 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4">
      <h2 className="text-lg font-bold tracking-[-0.01em] text-lake-950">Company details</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="company-name" className="block text-sm font-medium text-lake-700">Registered company name</label>
          <input id="company-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="company-reg" className="block text-sm font-medium text-lake-700">Registration number</label>
          <input id="company-reg" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="company-email" className="block text-sm font-medium text-lake-700">Contact email</label>
          <input id="company-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="company-phone" className="block text-sm font-medium text-lake-700">Contact phone</label>
          <input id="company-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={field} />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving || !name.trim()}
          className="rounded-lg bg-lake-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          {saving ? 'Saving' : 'Save details'}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-base font-medium text-lake-700">
            <CheckCircle2 size={18} /> Saved
          </span>
        )}
        {/* A disabled button is skipped by the tab order and fires no tooltip, so
            the reason it is unavailable has to be on the page. */}
        {!name.trim() && (
          <p className="w-full text-[15px] text-lake-700">Enter the registered company name before saving.</p>
        )}
      </div>
    </div>
  );
}

export default function CompanyPage() {
  const { currentUser } = useAuth();
  const ownerId = currentUser?.id ?? '';
  const { data: company, loading, error, reload } = useAsync(
    () => companies.getMyCompany(ownerId), [ownerId],
  );
  const [docsKey, setDocsKey] = useState(0);
  const {
    data: documents, loading: docsLoading, error: docsError,
  } = useAsync(
    () => (company ? companies.listCompanyDocuments(company.id) : Promise.resolve([])),
    [company?.id, docsKey],
  );

  // Bumping docsKey re-runs the documents hook on its own; calling its reload as
  // well would fire the same query twice and leave the first uncancellable.
  const refreshAll = () => { setDocsKey((k) => k + 1); reload(); };

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <Link to="/owner" className="inline-flex items-center gap-1.5 py-1 text-[15px] font-medium text-lake-700 hover:text-lake-900">
          <ArrowLeft size={16} /> Back to your boats
        </Link>

        <div className="mt-4">
          <DashboardBanner image={photos.harbour} eyebrow="Boat Owner Portal" title="Your company" icon={Building2} />
        </div>

        {loading && <div className="mt-6"><LoadingState large label="Loading your company" /></div>}
        {error && <div className="mt-6"><ErrorState large message={error} onRetry={reload} /></div>}

        {!loading && !error && !company && (
          <div className="mt-6">
            <EmptyState large
              title="No company on your account"
              hint="Your login is not linked to a company yet. Contact an administrator so your fleet can be moved onto one."
            />
          </div>
        )}

        {company && (
          <>
            <div className="mt-6 rounded-2xl border border-lake-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {company.verificationStatus === 'verified' ? <ShieldCheck size={20} className="text-lake-600" />
                    : company.verificationStatus === 'rejected' ? <ShieldAlert size={20} className="text-red-600" />
                    : <Clock size={20} className="text-amber-600" />}
                  <h2 className="min-w-0 break-words text-xl font-bold leading-snug tracking-[-0.015em] text-lake-950">{company.name}</h2>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_VIEW[company.verificationStatus].chip}`}>
                  {STATUS_VIEW[company.verificationStatus].label}
                </span>
              </div>
              <p className="mt-2 text-base leading-normal text-lake-700">{STATUS_VIEW[company.verificationStatus].blurb}</p>
              {company.verificationNote && (
                <p className="mt-2 rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] leading-normal text-lake-800">
                  Administrator: {company.verificationNote}
                </p>
              )}
            </div>

            <div className="mt-4">
              <CompanyDetails company={company} onSaved={reload} />
            </div>

            <h2 className="mt-10 font-display text-xl font-bold tracking-[-0.015em] text-lake-950">Proof of company ownership</h2>
            <p className="mt-1.5 text-base leading-normal text-lake-700">
              An administrator reviews each document separately, so you only replace the one that fails.
            </p>

            {/* Without this, a failed document fetch would leave every slot showing
                "Not uploaded" and an owner would reasonably re-upload all four. */}
            {docsLoading && <div className="mt-4"><LoadingState large label="Loading your documents" /></div>}
            {docsError && (
              <div className="mt-4">
                <ErrorState large message={docsError} onRetry={() => setDocsKey((k) => k + 1)} />
              </div>
            )}

            <div className={`mt-4 grid gap-3 ${docsLoading || docsError ? 'hidden' : ''}`}>
              {companies.REQUIRED_DOCUMENTS.map((slot) => (
                <DocumentSlot
                  key={slot.kind}
                  kind={slot.kind} label={slot.label} hint={slot.hint}
                  documents={documents ?? []}
                  companyId={company.id}
                  userId={currentUser?.id ?? ''}
                  onChanged={refreshAll}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
