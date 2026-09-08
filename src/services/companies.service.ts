import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

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

const BUCKET = 'registration-docs';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const COMPANY_SELECT =
  'id, name, registration_number, contact_email, contact_phone, verification_status, verification_note, verified_at, created_at';
const DOC_SELECT =
  'id, company_id, user_id, doc_kind, storage_path, file_name, label, review_status, review_note, reviewed_at, expires_at, uploaded_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCompany(r: any): Company {
  return {
    id: r.id, name: r.name, registrationNumber: r.registration_number,
    contactEmail: r.contact_email, contactPhone: r.contact_phone,
    verificationStatus: r.verification_status, verificationNote: r.verification_note,
    verifiedAt: r.verified_at, createdAt: r.created_at,
  };
}

function mapDoc(r: any): CompanyDocument {
  return {
    id: r.id, companyId: r.company_id, userId: r.user_id, docKind: r.doc_kind,
    storagePath: r.storage_path, fileName: r.file_name, label: r.label,
    reviewStatus: r.review_status, reviewNote: r.review_note, reviewedAt: r.reviewed_at,
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
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

  const { error } = await supabase.from('verification_documents').insert({
    user_id: userId, company_id: companyId, doc_kind: kind,
    storage_path: path, file_name: file.name,
    expires_at: input.expiresAt || null,
  });
  if (error) {
    // Do not leave an orphaned object behind if the row insert is refused.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(humanizeError(error.message));
  }
}

export async function deleteDocument(doc: CompanyDocument): Promise<void> {
  const { error } = await supabase.from('verification_documents').delete().eq('id', doc.id);
  if (error) throw new Error(humanizeError(error.message));
  await supabase.storage.from(BUCKET).remove([doc.storagePath]);
}

/** Short-lived URL for viewing a private document. Owner or admin, per storage RLS. */
export async function signedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw new Error(humanizeError(error.message));
  return data.signedUrl;
}

// ---------------------------------------------------------------- admin side

export interface CompanyForReview extends Company {
  documents: CompanyDocument[];
  pendingCount: number;
  approvedCount: number;
  missingKinds: DocumentKind[];
}

/** Every company plus its documents, for the admin verification queue. */
export async function listCompaniesForReview(): Promise<CompanyForReview[]> {
  const { data: companies, error } = await supabase
    .from('companies').select(COMPANY_SELECT).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));

  const { data: docs, error: dErr } = await supabase
    .from('verification_documents').select(DOC_SELECT).order('uploaded_at', { ascending: false });
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
    return {
      ...company,
      documents,
      pendingCount: documents.filter((d) => d.reviewStatus === 'pending').length,
      approvedCount: documents.filter((d) => d.reviewStatus === 'approved').length,
      missingKinds: REQUIRED_DOCUMENTS.map((r) => r.kind).filter((k) => !present.has(k)),
    };
  });
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
