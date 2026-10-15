import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';
import { DOCUMENT_BUCKET, deleteVerificationDocument } from './documentStorage.service';

export { signedUrl, openDocument } from './documentStorage.service';

export type CompanyVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type CompanyMemberRole = 'owner' | 'manager' | 'staff';
export type DocumentKind =
  | 'company_registration' | 'boat_ownership' | 'operator_licence' | 'director_id';
export type DocumentReviewStatus = 'pending' | 'approved' | 'rejected';

/** The four proofs an operator must file. Order here is the order shown on screen. */
export const REQUIRED_DOCUMENTS: { kind: DocumentKind; label: string; hint: string }[] = [
  {
    kind: 'company_registration',
    label: 'Company registration',
    hint: 'Certificate of incorporation or business registration certificate.',
  },
  {
    kind: 'boat_ownership',
    label: 'Proof of boat ownership',
    hint: 'Boat registration or title showing the company owns the vessel.',
  },
  {
    kind: 'operator_licence',
    label: 'Operator licence',
    hint: 'Tourism or marine permit allowing you to carry paying passengers.',
  },
  {
    kind: 'director_id',
    label: 'Director ID',
    hint: 'National ID or passport of the listed company director.',
  },
];

export const DOCUMENT_LABELS: Record<DocumentKind, string> = Object.fromEntries(
  REQUIRED_DOCUMENTS.map((d) => [d.kind, d.label]),
) as Record<DocumentKind, string>;

export interface Company {
  id: string;
  name: string;
  registrationNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  verificationStatus: CompanyVerificationStatus;
  verificationNote: string | null;
  verifiedAt: string | null;
  /** Why a verified company went back to review (an expired or removed proof, or changed details). */
  verificationLapseReason: string | null;
  createdAt: string;
}

export interface CompanyDocument {
  id: string;
  companyId: string | null;
  userId: string;
  docKind: DocumentKind | null;
  storagePath: string;
  fileName: string;
  label: string | null;
  reviewStatus: DocumentReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  uploadedAt: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const COMPANY_SELECT =
  'id, name, registration_number, contact_email, contact_phone, verification_status, verification_note, verified_at, verification_lapse_reason, created_at';
const DOC_SELECT =
  'id, company_id, user_id, doc_kind, storage_path, file_name, label, review_status, review_note, reviewed_at, expires_at, uploaded_at';

const COMPANY_STATUSES: readonly CompanyVerificationStatus[] = ['unverified', 'pending', 'verified', 'rejected'];
const REVIEW_STATUSES: readonly DocumentReviewStatus[] = ['pending', 'approved', 'rejected'];
const DOC_KINDS: readonly DocumentKind[] = REQUIRED_DOCUMENTS.map((d) => d.kind);

/**
 * review_status is a plain text column behind a CHECK constraint, so a later
 * migration can widen it without TypeScript noticing. Assigning an unseen value
 * straight into a closed union puts it into the Record lookups the screens index
 * by status, where the miss throws on `.chip` and white-screens the page. Coercing
 * here keeps the union honest and degrades to a safe status instead.
 */
function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCompany(r: any): Company {
  return {
    id: r.id, name: r.name, registrationNumber: r.registration_number,
    contactEmail: r.contact_email, contactPhone: r.contact_phone,
    // 'pending' rather than 'unverified': an unknown status must never read as
    // verified, nor tell an operator to re-upload proofs they already filed.
    verificationStatus: oneOf(COMPANY_STATUSES, r.verification_status, 'pending'),
    verificationNote: r.verification_note,
    verifiedAt: r.verified_at, verificationLapseReason: r.verification_lapse_reason ?? null,
    createdAt: r.created_at,
  };
}

function mapDoc(r: any): CompanyDocument {
  return {
    id: r.id, companyId: r.company_id, userId: r.user_id,
    // An unrecognised kind falls to null, which both screens already render as an
    // unclassified document rather than slotting it under the wrong proof.
    docKind: r.doc_kind && DOC_KINDS.includes(r.doc_kind) ? r.doc_kind : null,
    storagePath: r.storage_path, fileName: r.file_name, label: r.label,
    // 'pending' keeps an unknown review state out of the approved set, so it blocks
    // verification rather than silently satisfying it.
    reviewStatus: oneOf(REVIEW_STATUSES, r.review_status, 'pending'),
    reviewNote: r.review_note, reviewedAt: r.reviewed_at,
    expiresAt: r.expires_at, uploadedAt: r.uploaded_at,
  };
}

/**
 * The company the given profile belongs to, or null if they are not in one.
 *
 * The profile filter and the ordering are both deliberate: row level security
 * already hides other people's memberships, but an admin can see every row, and a
 * profile may legitimately belong to more than one company. Without both, this
 * returns a server-chosen row that can differ between page loads.
 */
export async function getMyCompany(profileId: string): Promise<Company | null> {
  const { data: membership, error: mErr } = await supabase
    .from('company_members').select('company_id')
    .eq('profile_id', profileId)
    .order('added_at', { ascending: true })
    .limit(1).maybeSingle();
  if (mErr) throw new Error(humanizeError(mErr.message));
  if (!membership) return null;

  const { data, error } = await supabase
    .from('companies').select(COMPANY_SELECT).eq('id', membership.company_id).maybeSingle();
  if (error) throw new Error(humanizeError(error.message));
  return data ? mapCompany(data) : null;
}

export async function updateCompany(
  companyId: string,
  patch: { name?: string; registrationNumber?: string; contactEmail?: string; contactPhone?: string },
): Promise<void> {
  const row: {
    name?: string;
    registration_number?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
  } = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.registrationNumber !== undefined) row.registration_number = patch.registrationNumber.trim() || null;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail.trim() || null;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone.trim() || null;
  if (Object.keys(row).length === 0) return;

  const { error } = await supabase.from('companies').update(row).eq('id', companyId);
  if (error) throw new Error(humanizeError(error.message));
}

export async function listCompanyDocuments(companyId: string): Promise<CompanyDocument[]> {
  const { data, error } = await supabase.from('verification_documents')
    .select(DOC_SELECT).eq('company_id', companyId).order('uploaded_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(mapDoc);
}

/**
 * Uploads one proof. The storage path stays under the uploader's own uid folder
 * because that is what the registration-docs storage policy checks.
 */
export async function uploadDocument(input: {
  companyId: string; userId: string; kind: DocumentKind; file: File; expiresAt?: string | null;
}): Promise<void> {
  const { companyId, userId, kind, file } = input;
  if (!ALLOWED.includes(file.type)) {
    throw new Error(`${file.name} must be a PDF, JPEG, or PNG.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is larger than 10 MB.`);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(DOCUMENT_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

  const { error } = await supabase.from('verification_documents').insert({
    user_id: userId, company_id: companyId, doc_kind: kind,
    storage_path: path, file_name: file.name,
    expires_at: input.expiresAt || null,
  });
  if (error) {
    // Do not leave an orphaned object behind if the row insert is refused.
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
    throw new Error(humanizeError(error.message));
  }
}

export async function deleteDocument(doc: CompanyDocument): Promise<void> {
  await deleteVerificationDocument(doc.id, doc.storagePath);
}

// ---------------------------------------------------------------- admin side

export interface CompanyForReview extends Company {
  documents: CompanyDocument[];
  pendingCount: number;
  approvedCount: number;
  /** Kinds with no document on file at all, or only rejected ones. */
  missingKinds: DocumentKind[];
  /** Kinds without an approved document. Verification is blocked while any remain. */
  awaitingApproval: DocumentKind[];
}

/** Every company plus its documents, for the admin verification queue. */
export async function listCompaniesForReview(): Promise<CompanyForReview[]> {
  const { data: companies, error } = await supabase
    .from('companies').select(COMPANY_SELECT).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));

  // Account-level documents live in the same table and were previously fetched here
  // only to be dropped in the loop below. The queue only ever shows company proofs.
  const { data: docs, error: dErr } = await supabase
    .from('verification_documents').select(DOC_SELECT)
    .not('company_id', 'is', null).order('uploaded_at', { ascending: false });
  if (dErr) throw new Error(humanizeError(dErr.message));

  const byCompany = new Map<string, CompanyDocument[]>();
  for (const raw of docs ?? []) {
    const doc = mapDoc(raw);
    if (!doc.companyId) continue;
    const list = byCompany.get(doc.companyId) ?? [];
    list.push(doc);
    byCompany.set(doc.companyId, list);
  }

  return (companies ?? []).map((raw) => {
    const company = mapCompany(raw);
    const documents = byCompany.get(company.id) ?? [];
    const present = new Set(documents.filter((d) => d.reviewStatus !== 'rejected').map((d) => d.docKind));
    const approved = new Set(documents.filter((d) => d.reviewStatus === 'approved').map((d) => d.docKind));
    const kinds = REQUIRED_DOCUMENTS.map((r) => r.kind);
    return {
      ...company,
      documents,
      pendingCount: documents.filter((d) => d.reviewStatus === 'pending').length,
      approvedCount: documents.filter((d) => d.reviewStatus === 'approved').length,
      missingKinds: kinds.filter((k) => !present.has(k)),
      awaitingApproval: kinds.filter((k) => !approved.has(k)),
    };
  });
}

/**
 * How many companies have at least one document still awaiting a decision.
 *
 * Deliberately not listCompaniesForReview: that reads every company and every
 * company document, so an admin who opens the dashboard for an unrelated tab would
 * download the whole review queue to render one tile number. Only pending rows are
 * read here, and only their company id.
 */
export async function countCompaniesAwaitingReview(): Promise<number> {
  const { data, error } = await supabase
    .from('verification_documents').select('company_id')
    .eq('review_status', 'pending').not('company_id', 'is', null);
  if (error) throw new Error(humanizeError(error.message));
  return new Set((data ?? []).map((r) => r.company_id)).size;
}

export async function reviewDocument(
  documentId: string, status: DocumentReviewStatus, note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_review_document', {
    p_document_id: documentId, p_status: status, p_note: note?.trim() || undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function reviewCompany(
  companyId: string, status: CompanyVerificationStatus, note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_review_company', {
    p_company_id: companyId, p_status: status, p_note: note?.trim() || undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}
