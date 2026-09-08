# Kariba Lake Connect: Company Tenants and Ownership Verification

**Date:** 2026-09-08
**Supabase project:** Kariba Boats (`sbrsptgpnjljnongklus`, eu-central-1)
**Status:** Design, awaiting approval
**Builds on:** migration `23_verification_documents.sql`, `15_add_account_verification_status.sql`

## 1. Goal

The platform already verifies **accounts**: an owner uploads registration documents to a
private bucket, and an admin verifies the profile through `admin_review_account`, which
refuses to verify anyone with zero documents on file.

Two things are missing for proof of *company* ownership:

1. **Tenancy.** A boat operator is a company, not a person. `boats.owner_id` points at a
   single profile, so a company is whatever one login happens to be. Several staff logins
   cannot share a fleet, and the documents proving the company exists are attached to an
   individual rather than to the business.
2. **Typed proof.** `verification_documents.label` is free text, so an admin cannot tell a
   certificate of incorporation from a boat registration without opening each file, and
   nothing records which of the required proofs are still missing.

## 2. Decisions taken

| Decision | Choice | Consequence |
|---|---|---|
| Tenant unit | `companies` + `company_members` | Several logins per operator, roles within the company |
| Documents | Extend `verification_documents`, do not add a parallel table | One upload path, one bucket, existing service and RLS keep working |
| Document typing | `doc_kind` enum, nullable for existing rows | The 8 documents already uploaded stay valid and can be classified later |
| Review granularity | Per document, then per company | Admin rejects one bad scan without failing the whole application |
| Existing boats | Backfilled into one company per current owner | No relisting, `owner_id` kept as the creating profile |
| Verified badge | Company verification, falling back to profile | Tourists see a badge backed by a reviewed company |

## 3. Architectural corrections to the brief

**3.1 Extend the existing document table, do not build a second one.** A separate
`company_documents` table beside `verification_documents` would mean two buckets, two
upload paths, two RLS surfaces and an admin who has to look in two places. The existing
table gains `company_id`, `doc_kind` and review columns instead.

**3.2 Documents are reviewed per file, the company is verified as a whole.** If the
operator licence is fine but the director ID is unreadable, the admin must be able to say
which one to replace. Each document carries its own `review_status`; company verification
is a separate decision taken once the documents support it.

**3.3 Verification does not expire silently.** Operator licences lapse. Documents carry an
optional `expires_at`, so an expired licence can surface in the admin queue rather than a
company quietly keeping a badge it no longer earns.

**3.4 `owner_id` stays.** It remains the profile that created the listing, which the hours
and maintenance ledgers already reference. `company_id` becomes the tenant key that RLS
and visibility are decided on. Dropping `owner_id` would mean rewriting that history for
no gain.

**3.5 The account gate stays as it is.** `admin_review_account` continues to govern whether
a login may act. Company verification governs whether the *business* is proven. An owner
whose company is unverified can still sign in and prepare listings, exactly as today.

## 4. Schema

### 4.1 New tables

```
companies
  id, name, registration_number, contact_email, contact_phone,
  verification_status  unverified | pending | verified | rejected
  verification_note, verified_at, verified_by, created_by, created_at, updated_at

company_members
  company_id, profile_id, member_role (owner|manager|staff), added_at
  primary key (company_id, profile_id)
```

### 4.2 Changed tables

`verification_documents` gains `company_id`, `doc_kind`, `review_status`, `review_note`,
`reviewed_by`, `reviewed_at`, `expires_at`. `doc_kind` is one of `company_registration`,
`boat_ownership`, `operator_licence`, `director_id`.

`boats` gains `company_id`, backfilled from `owner_id` before the not-null constraint
lands. Owner-side policies on `boats` and `boat_images` move from `owner_id = auth.uid()`
to `public.is_company_member(company_id)`.

`public_boats.operator_verified` becomes true when the company is verified, falling back
to the profile's own status for any boat not yet in a company.

### 4.3 Helper functions

* `public.current_user_company()` returns the caller's company, or null.
* `public.is_company_member(uuid)` is the predicate the owner-side policies use.

Both are `security definer` with a pinned `search_path`, matching `is_admin()`.

## 5. Access rules

| Actor | Companies | Documents | Storage |
|---|---|---|---|
| Anonymous | Name only, via `public_boats` | None | None |
| Member of company A | Read and update A | Read and upload A's | Own folder only |
| Non-member owner | None | None | None |
| Admin | All, plus review columns | All, plus review columns | All |

A guard trigger blocks non-admins writing `verification_status`, `review_status`,
`review_note`, `reviewed_by` and `reviewed_at`, in the same shape as the existing
`guard_profile_privileges`. Column grants alone would not stop an owner verifying
their own company.

## 6. Backfill

For each profile with `role = 'owner'`:

1. Create a company named from `business_name`, falling back to `full_name`.
2. Add the profile as a `company_members` row with `member_role = 'owner'`.
3. Point that profile's boats and existing documents at the new company.
4. Carry `profiles.verification_status = 'verified'` across to the company, so no
   operator loses a badge they already hold.

New owner signups create their company in `handle_new_user`, alongside the profile.

## 7. Surfaces

**Owner:** a Company page showing verification state, the four required proofs with
per-document status, upload and replace, and the admin's note when something is rejected.

**Admin:** company verification beside the existing user verification, listing companies
with pending documents, each viewable through a signed URL, approve or reject per
document, then verify or reject the company with a note.

## 8. Out of scope

Inviting staff by email, permission editing beyond the three member roles, and automated
licence expiry reminders. `expires_at` is in the schema so reminders can be added later
without another migration.
