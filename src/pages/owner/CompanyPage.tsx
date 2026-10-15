import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ShieldCheck, Clock, ShieldAlert, Upload, Trash2, Eye, CheckCircle2, AlertTriangle, Building2, UserRound,
} from 'lucide-react';
import OwnerPortalPage from '../../components/owner/OwnerPortalPage';
import TeamSection from '../../components/owner/TeamSection';
import RoleNotice from '../../components/owner/RoleNotice';
import PortalSection from '../../components/portal/PortalSection';
import { portalCard, portalButtonPrimary, portalButtonSecondary } from '../../components/portal/styles';
import { LoadingState, ErrorState, EmptyState } from '../../components/StateViews';
import Reveal from '../../components/Reveal';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../data/AuthContext';
import { useOperatorAccess } from '../../data/operatorAccess';
import * as companies from '../../services/companies.service';
import type {
  Company, CompanyDocument, DocumentKind, CompanyVerificationStatus, OperatorType,
} from '../../services/companies.service';

const STATUS_VIEW: Record<CompanyVerificationStatus, { label: string; chip: string; blurb: string }> = {
  unverified: {
    label: 'Not yet submitted',
    chip: 'bg-gray-100 text-gray-700',
    blurb: 'Upload the proofs below so an administrator can verify your business.',
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
  kind, label, hint, documents, companyId, userId, canManage, onChanged,
}: {
  kind: DocumentKind; label: string; hint: string;
  documents: CompanyDocument[]; companyId: string; userId: string;
  /** Owners and managers file proofs (manage_documents, migration 40); staff only view them. */
  canManage: boolean;
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
    <div className={`${portalCard} p-4 sm:p-5`}>
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
                {/* Only the uploader can withdraw an unapproved document: the file
                    lives in their own storage folder. */}
                {canManage && doc.reviewStatus !== 'approved' && doc.userId === userId && (
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
      {canManage && <>
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
      </>}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>
      )}
    </div>
  );
}

/** The details as text, for a member whose role cannot change them. */
function CompanyDetailsReadOnly({ company }: { company: Company }) {
  const row = (label: string, value: string | null) => (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-lake-700">{label}</dt>
      <dd className="mt-0.5 break-words text-base text-lake-950">{value || 'Not given'}</dd>
    </div>
  );
  return (
    <div className={`${portalCard} p-4 sm:p-5`}>
      <h2 className="text-lg font-bold tracking-[-0.01em] text-lake-950">
        {company.operatorType === 'individual' ? 'Business details' : 'Company details'}
      </h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {row(company.operatorType === 'individual' ? 'Business name' : 'Registered company name', company.name)}
        {company.operatorType === 'company' && row('Registration number', company.registrationNumber)}
        {row('Contact email', company.contactEmail)}
        {row('Contact phone', company.contactPhone)}
      </dl>
      <p className="mt-3 text-sm leading-normal text-lake-700">Only a team owner can change these details.</p>
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
  const [confirming, setConfirming] = useState(false);
  const reduce = useReducedMotion();
  const saveButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  // A verified company that changes the name or number its documents were checked
  // against goes back to review (migration 37), so that save is confirmed first.
  // Compared the way updateCompany stores them: trimmed, and blank as null.
  const identityChanged =
    name.trim() !== company.name
    || (registrationNumber.trim() || null) !== (company.registrationNumber ?? null);
  const needsConfirm = company.verificationStatus === 'verified' && identityChanged;

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const requestSave = () => {
    setError(null); setSaved(false);
    if (needsConfirm) { setConfirming(true); return; }
    void save();
  };

  const cancelConfirm = () => {
    setConfirming(false);
    requestAnimationFrame(() => saveButton.current?.focus());
  };

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      await companies.updateCompany(company.id, { name, registrationNumber, contactEmail, contactPhone });
      setConfirming(false);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1.5 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';
  const individual = company.operatorType === 'individual';

  return (
    <div className={`${portalCard} p-4 sm:p-5`}>
      <h2 className="text-lg font-bold tracking-[-0.01em] text-lake-950">{individual ? 'Business details' : 'Company details'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="company-name" className="block text-sm font-medium text-lake-700">
            {individual ? 'Business or trading name' : 'Registered company name'}
          </label>
          <input id="company-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        {/* A sole trader has no company registration number to give. */}
        {!individual && (
          <div>
            <label htmlFor="company-reg" className="block text-sm font-medium text-lake-700">Registration number</label>
            <input id="company-reg" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className={field} />
          </div>
        )}
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
      {company.verificationStatus === 'verified' && !confirming && (
        <p className="mt-3 text-sm leading-normal text-lake-700">
          {individual
            ? 'You are verified under this name. Changing it sends your account back for review.'
            : 'Your company is verified under this name and registration number. Changing either sends it back for review.'}
        </p>
      )}
      <AnimatePresence initial={false}>
        {confirming && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.24, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div role="alertdialog" aria-labelledby="company-confirm-title" aria-describedby="company-confirm-body"
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <h3 id="company-confirm-title" className="flex items-center gap-2 text-base font-bold text-lake-950">
                <AlertTriangle size={18} className="shrink-0 text-amber-700" aria-hidden /> Your company will need to be verified again
              </h3>
              <p id="company-confirm-body" className="mt-1.5 text-[15px] leading-relaxed text-lake-900">
                You changed the {name.trim() !== company.name ? 'company name' : 'registration number'}
                {name.trim() !== company.name && (registrationNumber.trim() || null) !== (company.registrationNumber ?? null) ? ' and registration number' : ''}.
                Your documents were checked against the old details, so your company goes back to Under review until an
                administrator checks them again. Your listings show without the verified badge until then.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button ref={confirmButton} type="button" onClick={() => void save()} disabled={saving}
                  className="rounded-lg bg-lake-700 px-4 py-2.5 text-sm font-semibold text-white outline-none hover:bg-lake-800 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 disabled:opacity-50">
                  {saving ? 'Saving' : 'Save and send for review'}
                </button>
                <button type="button" onClick={cancelConfirm} disabled={saving}
                  className="rounded-lg border border-lake-200 bg-white px-4 py-2.5 text-sm font-semibold text-lake-700 outline-none hover:bg-lake-50 focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 disabled:opacity-50">
                  Keep editing
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button ref={saveButton} onClick={requestSave} disabled={saving || confirming || !name.trim()}
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
          <p className="w-full text-[15px] text-lake-700">Enter the {individual ? 'business' : 'registered company'} name before saving.</p>
        )}
      </div>
    </div>
  );
}

/**
 * An individual operator becomes a registered company (upgrade_to_company,
 * migration 40). One way only. A verified individual goes back to review: a company
 * also files its registration, and the name changes to the registered one.
 */
function UpgradeToCompany({ company, onUpgraded }: { company: Company; onUpgraded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reduce = useReducedMotion();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) nameRef.current?.focus(); }, [open]);

  const field = 'mt-1.5 w-full rounded-lg border border-lake-200 bg-white px-3 py-2.5 text-base text-lake-950 outline-none focus:border-lake-500';

  const submit = async () => {
    if (!name.trim()) { setError('Enter the registered company name.'); return; }
    setBusy(true); setError('');
    try {
      await companies.upgradeToCompany(company.id, name, registrationNumber);
      setOpen(false);
      onUpgraded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch to a company account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${portalCard} p-4 sm:p-5`}>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-lake-950">
        <Building2 size={18} aria-hidden /> Grown into a company?
      </h2>
      <p className="mt-1.5 text-[15px] leading-normal text-lake-700">
        Switch to a company account to add managers and crew to your workspace. Your boats, bookings and documents
        stay as they are. A company also files its registration certificate
        {company.verificationStatus === 'verified' ? ', so your verification goes back to review until it is checked' : ''}.
        This cannot be undone from here.
      </p>
      {!open && (
        <button type="button" onClick={() => { setOpen(true); setError(''); }} className={`${portalButtonSecondary} mt-3`}>
          Switch to a company account
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.24, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="upgrade-name" className="block text-sm font-medium text-lake-700">Registered company name</label>
                <input ref={nameRef} id="upgrade-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
              </div>
              <div className="min-w-0">
                <label htmlFor="upgrade-reg" className="block text-sm font-medium text-lake-700">Registration number</label>
                <input id="upgrade-reg" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className={field} />
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[15px] leading-normal text-red-700">{error}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void submit()} disabled={busy || !name.trim()} className={portalButtonPrimary}>
                {busy ? 'Switching' : 'Switch to a company account'}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className={portalButtonSecondary}>
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const TYPE_ICON: Record<OperatorType, typeof Building2> = { individual: UserRound, company: Building2 };

export default function CompanyPage() {
  const { currentUser } = useAuth();
  const access = useOperatorAccess();
  const company = access.company;
  const [docsKey, setDocsKey] = useState(0);
  const {
    data: documents, loading: docsLoading, error: docsError,
  } = useAsync(
    () => (company ? companies.listCompanyDocuments(company.id) : Promise.resolve([])),
    [company?.id, docsKey],
  );
  const [leftMessage, setLeftMessage] = useState('');

  // Bumping docsKey re-runs the documents hook on its own; reloading the workspace
  // re-reads the company (its status may have lapsed) and the team.
  const refreshAll = () => { setDocsKey((k) => k + 1); access.reload(); };

  const canEditCompany = access.can('edit_company');
  const canManageDocs = access.can('manage_documents');
  const loading = access.loading && !company;
  const slots = company ? companies.requiredDocuments(company.operatorType) : [];
  const TypeIcon = company ? TYPE_ICON[company.operatorType] : Building2;

  return (
    <OwnerPortalPage
      title={company?.operatorType === 'individual' ? 'Your business' : 'Your company'}
      crumb={company?.operatorType === 'individual' ? 'Business' : 'Company'}
    >
      {loading && <LoadingState large label="Loading your company" />}
      {access.error && <ErrorState large message={access.error} onRetry={access.reload} />}

      {leftMessage && (
        <p role="status" className="mb-4 rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] leading-normal text-lake-800">{leftMessage}</p>
      )}

      {!access.loading && !access.error && !company && (
        <EmptyState large
          title="No company on your account"
          hint="Your login is not linked to a company yet. Contact an administrator so your fleet can be moved onto one."
        />
      )}

      {company && (
        <>
          {access.role && access.role !== 'owner' && (
            <RoleNotice role={access.role}>
              {canManageDocs
                ? 'You can upload and view the proofs below. Only a team owner changes the company details and the team.'
                : 'You can view the company, its proofs and the team. Only a team owner or manager files documents.'}
            </RoleNotice>
          )}

          {/* Verification status beside the editable details on a wide screen,
              the way an account page sets the summary next to the form. Both rise
              in when the company has loaded. */}
          <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-6">
            <Reveal className={`${portalCard} min-w-0 p-4 sm:p-5`}>
              <div className="flex flex-wrap gap-1.5">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${STATUS_VIEW[company.verificationStatus].chip}`}>
                  {STATUS_VIEW[company.verificationStatus].label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-lake-50 px-2.5 py-1 text-[13px] font-semibold leading-none text-lake-900 ring-1 ring-lake-200">
                  <TypeIcon size={13} aria-hidden /> {companies.OPERATOR_TYPE_LABELS[company.operatorType]}
                </span>
              </div>
              <div className="mt-3 flex min-w-0 items-start gap-2">
                {company.verificationStatus === 'verified' ? <ShieldCheck size={20} className="mt-1 shrink-0 text-lake-600" />
                  : company.verificationStatus === 'rejected' ? <ShieldAlert size={20} className="mt-1 shrink-0 text-red-600" />
                  : <Clock size={20} className="mt-1 shrink-0 text-amber-600" />}
                <h2 className="min-w-0 break-words text-xl font-bold leading-snug tracking-[-0.015em] text-lake-950">{company.name}</h2>
              </div>
              <p className="mt-2 text-base leading-normal text-lake-700">{STATUS_VIEW[company.verificationStatus].blurb}</p>
              {company.verificationStatus === 'pending' && company.verificationLapseReason && (
                <p className="mt-3 break-words rounded-lg bg-amber-50 px-3.5 py-2.5 text-[15px] leading-normal text-amber-900">
                  {company.verificationLapseReason}
                </p>
              )}
              {company.verificationNote && (
                <p className="mt-3 break-words rounded-lg bg-lake-50 px-3.5 py-2.5 text-[15px] leading-normal text-lake-800">
                  Administrator: {company.verificationNote}
                </p>
              )}
            </Reveal>

            <Reveal className="min-w-0 space-y-4">
              {canEditCompany
                ? <CompanyDetails key={`${company.id}-${company.operatorType}`} company={company} onSaved={access.reload} />
                : <CompanyDetailsReadOnly company={company} />}
              {canEditCompany && company.operatorType === 'individual' && (
                <UpgradeToCompany key={company.id} company={company} onUpgraded={refreshAll} />
              )}
            </Reveal>
          </div>

          <PortalSection
            title={company.operatorType === 'individual' ? 'Proof that you can operate' : 'Proof of company ownership'}
            description={company.operatorType === 'individual'
              ? `As an individual operator you file ${slots.length} proofs, and no company registration. An administrator reviews each one separately, so you only replace the one that fails.`
              : 'An administrator reviews each document separately, so you only replace the one that fails.'}
            className="mt-10"
          >
            {/* Without this, a failed document fetch would leave every slot showing
                "Not uploaded" and an owner would reasonably re-upload all of them. */}
            {docsLoading && <LoadingState large label="Loading your documents" />}
            {docsError && (
              <ErrorState large message={docsError} onRetry={() => setDocsKey((k) => k + 1)} />
            )}

            <div className={`grid items-start gap-4 md:grid-cols-2 ${docsLoading || docsError ? 'hidden' : ''}`}>
              {/* The slots rise in once the documents are in and the grid is shown. */}
              {slots.map((slot) => (
                <Reveal key={slot.kind} className="min-w-0">
                  <DocumentSlot
                    kind={slot.kind} label={slot.label} hint={slot.hint}
                    documents={documents ?? []}
                    companyId={company.id}
                    userId={currentUser?.id ?? ''}
                    canManage={canManageDocs}
                    onChanged={refreshAll}
                  />
                </Reveal>
              ))}
            </div>
          </PortalSection>

          <TeamSection
            company={company}
            role={access.role}
            members={access.members}
            loading={access.loading}
            onChanged={access.reload}
            onLeft={() => {
              setLeftMessage('You left the team. You now have an empty workspace of your own.');
              access.reload();
            }}
          />
        </>
      )}
    </OwnerPortalPage>
  );
}
