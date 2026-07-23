# Verification and Documents (Subsystem C)

Date: 2026-07-23
Status: Approved design, ready for implementation

## Goal

Owners and hotels upload company registration documents. Admins review the documents
during account verification. An account cannot be marked verified until at least one
document is on file. Verified accounts can then publish boats to tourists (the existing
`verification_status = 'verified'` gate on `submit_boat_for_review`).

## Decisions (approved)

- Uploading at least one document is **required** before an admin can set an account to
  `verified` (server-enforced).
- Documents are **simple**: one or more files (PDF, JPEG, PNG), each with an optional
  free-text label. No fixed typed slots.

## Data model (migration 23)

- Private storage bucket `registration-docs` (`public = false`). These are sensitive, so
  they are never public; the admin views them through short-lived signed URLs.
  - Storage RLS on `storage.objects` for bucket `registration-docs`:
    - insert/select/delete where `bucket_id = 'registration-docs'` and the first path
      segment equals `auth.uid()` (owner manages their own folder).
    - select where `bucket_id = 'registration-docs'` and `public.is_admin()` (admin reads all).
- Table `public.verification_documents`:
  - `id uuid pk`, `user_id uuid not null` (the owner/hotel), `storage_path text not null`,
    `file_name text not null`, `label text`, `uploaded_at timestamptz default now()`.
  - RLS: select/insert/delete where `user_id = auth.uid()`; select where `public.is_admin()`.
    (A user manages only their own document rows; admins read all.)
  - Audited by the subsystem-3 trigger (`record_audit`).
- Path convention: `{user_id}/{uuid}.{ext}`.

## Verify gate (migration 23)

- `admin_review_account` and `admin_verify_hotel`: when the new status is `verified`,
  raise `This account has not uploaded any registration documents yet.` if
  `not exists (select 1 from verification_documents where user_id = p_user_id)`. All other
  behavior unchanged. (Rejecting or setting pending needs no documents.)

## Services

- `src/services/documents.service.ts`:
  - `listMyDocuments(): VerificationDocument[]` (owner's own).
  - `uploadDocuments(files: {file: File; label: string}[]): void` (validates type/size,
    uploads to storage, inserts rows; removes the storage object if the row insert fails).
  - `deleteDocument(doc): void`.
  - `listUserDocuments(userId): VerificationDocument[]` (admin; RLS-gated).
  - `signedUrl(storagePath): string` via `storage.from('registration-docs').createSignedUrl(path, 60)`.
  - Limits: PDF/JPEG/PNG, 10 MB, at most 8 documents per user.

## Client

- `src/components/verification/DocumentUploader.tsx`: lists the user's documents (name,
  label, uploaded date), a file picker with an optional label field, upload and delete.
  Shown on the owner and hotel dashboards near the `VerificationBanner`, only while the
  account is not yet verified (still viewable after, read-only, so they can see what is on file).
- `VerificationBanner`: add a line prompting the user to upload registration documents so
  the team can verify them.
- Admin `UserVerification`: under each account, list its uploaded documents with a "View"
  link (opens a signed URL in a new tab). The Verify / Verify hotel buttons are disabled
  with a hint when the account has no documents (the server enforces this regardless).

## Non-goals

- No document expiry, versioning, or OCR.
- Agencies are out of scope until subsystem B; the same uploader and table will serve them.

## Testing / verification

1. Migration applies; `registration-docs` bucket exists and is private.
2. Storage RLS: an owner can upload and list files under their own folder and cannot read
   another user's; an admin can read any. `verification_documents` RLS matches.
3. Uploading as an owner creates a row and a storage object; deleting removes both.
4. `admin_review_account` / `admin_verify_hotel` reject verifying an account with zero
   documents, and succeed once at least one exists.
5. Admin sees a pending account's documents and a working signed-URL "View" link.
6. Build, lint, and security advisor clean (private bucket, RLS present, definer functions
   keep explicit search_path).
