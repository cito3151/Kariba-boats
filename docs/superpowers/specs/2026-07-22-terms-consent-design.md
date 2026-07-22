# Terms, Consent, and Legal Agreements (Subsystem 4 of 4)

Date: 2026-07-22
Status: Approved design, ready for implementation plan

## Goal

Capture explicit, versioned, provable consent to the platform's legal documents at
every touchpoint where it matters, so Kariba Lake Access has a defensible,
transparent record of what each user agreed to and when. This is the fourth and
final governance subsystem, following verification (1), role management (2), and
the audit trail (3).

## Scope (decided)

Four consent points, each backed by a versioned document and a recorded acceptance:

1. **Terms of Service + Privacy Policy** at signup, required for every role.
2. **Operator agreement** (commission, listing accuracy, safety obligations) for
   owner and hotel accounts, folded into the signup checkboxes.
3. **Booking liability waiver**, acknowledged per booking by the tourist or hotel
   creating it, recorded against that booking.
4. **Marketing / comms opt-in**, optional and declinable everywhere, never gates.

Documents are DB-managed and versioned. Super-admins edit and publish them from the
dashboard. Required documents gate on next login when a new version is published
(blocking re-consent). Enforcement is server-side (Postgres is the boundary).

## Non-goals

- No e-signature integration, no PDF generation, no legally reviewed wording for
  alpha (starter text is clearly marked DRAFT).
- No per-jurisdiction document variants.
- No dedicated admin "Consents" screen; visibility is a filter in the existing
  Activity log (subsystem 3).

## Data model (migration 18)

### `legal_documents`
One row per document version.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| doc_type | enum `legal_doc_type` | `terms`, `privacy`, `operator_agreement`, `booking_waiver`, `marketing` |
| version | int | monotonic per doc_type |
| title | text | |
| body | text | markdown |
| is_required | bool | account-gate flag: terms/privacy/operator_agreement = true; booking_waiver/marketing = false |
| applies_to_roles | text[] null | null = all roles; operator_agreement = `{owner,hotel}`. Scopes which roles the account gate applies to |
| is_current | bool | exactly one true per doc_type |
| effective_at | timestamptz | |
| published_at | timestamptz | |
| published_by | uuid | profiles.id of the super-admin |

**Two distinct notions of "required":**
- `is_required = true` means the document is an **account-level gate**: the user must
  have accepted the current version (for their role) to pass the re-consent gate and
  perform gated actions. Applies to Terms, Privacy, and (for owner/hotel only, via
  `applies_to_roles`) the Operator agreement.
- The **booking waiver** is required *per booking*, enforced at booking time by
  `create_booking`, not as an account gate. It carries `is_required = false` so it
  never blocks login. Marketing is never required.

- Partial unique index enforces at most one `is_current = true` per `doc_type`.
- Unique `(doc_type, version)`.
- RLS: current documents are readable by everyone (including anon, for the signup
  page and public footer links); non-current versions readable by admins. Writes
  only through the publish RPC (definer).

### `consent_records`
Append-only acceptance ledger.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid | profiles.id |
| document_id | uuid | the exact version accepted |
| doc_type | enum | denormalized for filtering |
| version | int | denormalized |
| context | enum `consent_context` | `signup`, `re_consent`, `booking` |
| booking_id | uuid null | set when context = booking |
| accepted | bool | false records an explicit decline (marketing) |
| accepted_at | timestamptz | default now() |

- Append-only, same guarantees as `audit_log`: RLS grants select to the owner and
  to admins; no client insert/update/delete policy. The only writer is the
  `record_consent` SECURITY DEFINER RPC.
- Added to the subsystem-3 audit triggers, so every acceptance and decline is also
  an `audit_log` entry (entity_type `consent_records`).

## Functions (all SECURITY DEFINER, explicit search_path)

- `record_consent(p_doc_type, p_version, p_context, p_booking_id, p_accepted)`
  Validates the version is the current one for that doc_type, inserts one
  `consent_records` row for `auth.uid()`. Only writer to the table.
- `outstanding_consents(p_user uuid default auth.uid())` returns the set of
  required, current documents applicable to the user's role that they have not
  accepted at the current version (doc_type, version, title, body). Excludes the
  booking waiver and marketing. Drives the signup and re-consent surfaces.
- `has_outstanding_required_consent(p_user uuid default auth.uid())` boolean helper
  used by the write guards.
- `publish_legal_document(p_doc_type, p_title, p_body, p_is_required)`
  super-admin only. Inserts the next version, flips the previous `is_current` off,
  stamps `published_by`/`published_at`. Bumping a required doc means every user is
  now behind and will hit the re-consent gate on their next gated action.

## Enforcement (Approach A, server-side)

Existing gated write RPCs gain a guard at the top:
`if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;`
Applied to: `submit_boat_for_review`, `propose_boat_changes`, `owner_set_booking_status`,
and the new `create_booking` RPC below. Read paths and the consent RPCs themselves are
never gated (a user must be able to reach the accept screen). `humanizeError` maps
`Consent required` to a friendly message that routes the user to the re-consent screen.

**Booking creation moves to a `create_booking` RPC.** Today `bookings.service.ts`
inserts directly into `bookings` (a permissive `bookings_insert_authenticated` policy
with `WITH CHECK (true)`, which the security advisor flags). This subsystem replaces
that with a `create_booking(...)` SECURITY DEFINER RPC that, in one transaction:
(1) guards on `has_outstanding_required_consent`, (2) inserts the booking (subject to
the existing double-booking exclusion constraint), and (3) records the `booking_waiver`
consent against the new booking id. The direct client INSERT on `bookings` is then
revoked, so no booking can exist without its waiver, and the always-true INSERT policy
advisory is resolved as a side benefit. The waiver acknowledgment is a required RPC
argument, so a missing waiver rejects the booking.

## Client surfaces

- **Signup (`Signup.tsx`):** required checkboxes for Terms + Privacy (all roles),
  Operator agreement (owner/hotel), and an optional unchecked Marketing opt-in. Each
  label links to a `DocumentModal` rendering the current body. Submit is disabled
  until required boxes are ticked. After the account is created, the client calls
  `record_consent` once per document (signup context); the marketing row is written
  with the user's actual choice.
- **Re-consent gate:** `AuthContext` calls `outstanding_consents()` after login. If
  non-empty, a blocking `ConsentGate` route/modal lists each outstanding document
  with view + accept and calls `record_consent` (re_consent context) per document
  before releasing the user into the app. Server guard is the backstop.
- **Booking (`BoatDetail.tsx` booking form):** a required waiver acknowledgment
  checkbox with a link to the current waiver. `createBooking` in the service layer
  now calls the `create_booking` RPC (passing the waiver acknowledgment), which
  records the waiver atomically with the booking.
- **Public footer:** links to the current Terms and Privacy documents (read-only
  view), so they are reachable without an account.

## Admin surfaces

- **Legal documents editor:** super-admin-only dashboard panel (new tile, gated by
  `isSuperAdmin` exactly like "Admins & roles"). Lists each doc_type with its
  current version, effective date, and required flag; edit title/body/required;
  "Publish new version" calls `publish_legal_document`. A clear note warns that
  publishing a required document forces re-consent for all users.
- **Consent visibility:** add `consent_records` to the entity-type filter in the
  existing Activity log (`AuditLog.tsx`), so all admins can see acceptances and
  declines with actor and version. No separate screen.

## Starter content (seeded as version 1)

Plain-language DRAFT text for all five documents, each headed "DRAFT for alpha
testing, not legal advice, review before public launch": Terms of Service, Privacy
Policy, Operator Agreement (commission + listing accuracy + safety obligations),
Booking Liability Waiver (safety briefing, assumption of risk, weather/lake
conditions), and Marketing Consent. Seeded so the full flow is testable immediately.

## Types and services

- Regenerate `database.ts` for the new tables/enums/functions (or targeted edits
  following the established pattern).
- `src/services/legal.service.ts`: `listCurrentDocuments`, `getDocument`,
  `outstandingConsents`, `recordConsent`, `publishDocument`, mapping snake to camel
  and routing errors through `humanizeError`.

## Testing / verification

1. Migration applies; seed creates 5 current v1 documents.
2. Signup: required-unchecked blocks submit; a completed signup writes the correct
   `consent_records` (Terms + Privacy for tourist; + Operator for owner/hotel;
   marketing row reflects the checkbox).
3. Booking: creating a booking writes a `booking_waiver` record tied to the
   `booking_id`; the booking and waiver appear together; no waiver, no booking.
4. Re-consent: publish a new Terms version; an existing user's next gated RPC raises
   `Consent required`; the accept screen records re_consent and clears the gate.
5. Append-only: `consent_records` PATCH and DELETE via REST return 403.
6. Authorization: a non-super-admin cannot see or call the document editor;
   `publish_legal_document` rejects non-super callers.
7. Audit: publish and acceptance both appear in the Activity log; the
   `consent_records` filter works.
8. Gates: build, lint, and security advisor clean (new definer functions set an
   explicit search_path and self-guard); all throwaway accounts and test rows
   purged; cyton retains admin + super-admin.

## Consequences

- Every gated action now depends on the user being current on required consents;
  the friendly error and re-consent screen keep this from feeling like a dead end.
- Publishing a required document is a high-impact action (forces global re-consent);
  the editor states this explicitly and it is a super-admin-only capability.
- Moving booking creation to `create_booking` resolves the permissive
  `bookings_insert_authenticated` (WITH CHECK true) security advisory.
- Completes the governance program: verification, roles, audit, and now consent.
