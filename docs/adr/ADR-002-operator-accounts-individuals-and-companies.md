# ADR-002: Operator accounts for individuals and multi-user companies

**Date:** 2026-10-15
**Status:** Accepted (implementation in migration 40, pending review and apply)

## Context

The owner said: "Individuals and multi-user companies are both goals." Today the platform
says it has company tenants but behaves as if every operator were one person.

### What exists (checked live, project `sbrsptgpnjljnongklus`)

- **Tenants (28, 28b–28e).** `companies`, `company_members (company_id, profile_id,
  member_role)` with the enum `company_member_role = owner | manager | staff`, typed
  `verification_documents`, `boats.company_id`, the verification lifecycle and
  `company_missing_proofs`, which requires an approved, unexpired document of **every**
  kind in `company_document_kind` (`company_registration`, `boat_ownership`,
  `operator_licence`, `director_id`). `handle_new_user` creates a company with the new
  operator as its `owner` member.
- **Live data.** 1 company (verified, grandfathered with 0 documents), 1 member (owner),
  3 boats (all with a company, all held by that owner), 0 captains, 0 documents, no
  profile in two companies, no owner profile without a company.
- **Ownership tests.** Every owner read policy (boats, boat_images, maintenance records,
  hours, approval logs, the operator branch of `bookings_read_involved`) and every owner
  RPC (`propose_boat_changes`, `submit_boat_for_review`, `soft_delete_boat`,
  `log_operating_hours`, `void_operating_hours`, `complete_maintenance`,
  `owner_set_booking_status`, `assign_captain`, `cancel_booking`) tests
  `boats.owner_id = auth.uid()`. `captains` is owner-scoped (`captains_owner_all`).
  Storage uploads to `boat-images` require `boats.owner_id = auth.uid()`. Only review
  replies use `is_boat_manager` (32: owner or any company member). The frontend reads
  `listOwnerBoats`, `listBookingsForOwner`, `listReviewsForOwner` and `listMyCaptains` by
  `owner_id`.
- **Membership writes.** `company_members` has a SELECT policy only; `authenticated`
  still held the default table-wide grants. There is no way to add, remove or change a
  member.
- **Inconsistent writes.** `boats_update_own`, `boat_images_write_own` and the
  `verification_documents` policies already admit *any* company member. They are
  inconsistent with the reads and, for boat_images, give a future staff member full write.
- **Deletion (33).** The purge hands a deleted owner's boats to another member whose role
  is `owner`; otherwise it takes them off the listing. The account-deletion copy says so.

### Requirements

1. A sole trader can operate without pretending to be a company, and without a company
   registration document.
2. A company can have several people with different powers.
3. A sole operator with no team keeps working exactly as today.
4. Tourist, hotel and agency behaviour does not change.
5. One access rule, applied everywhere, that cannot be bypassed by a path someone forgot.

## Decision

**One tenant model for both. Every operator account works inside exactly one workspace
(`companies`), typed `individual` or `company`. Access to a boat and everything attached
to it goes through membership of the boat's company with a minimum role, through one pair
of helpers (`has_company_permission`, `has_boat_permission`) driven by one permission
matrix (`company_permission_min_role`). `boats.owner_id` stays as the boat's accountable
owner, which is always an `owner` member, and grants nothing by itself.**

### 1. Individuals and companies

- **`companies.operator_type`** (`individual` | `company`, NOT NULL, default `company`).
  An `individual` workspace always has exactly one member, enforced in
  `add_company_member` and by the `company_members_guard` trigger.
- **Proofs per type.** `required_proof_kinds(type)`: a company needs every kind in the
  enum (28d's "all proofs" rule, so a new kind still tightens it automatically); an
  individual needs every kind except `company_registration`. `director_id` is reused as
  the individual's own **national ID or passport** (labelled that way on screen) rather
  than adding an enum value: same document, same person, no enum migration, and the
  document carries over if the individual upgrades. An individual still needs **proof of
  boat ownership** and the **operator licence**: the licence to carry paying passengers
  does not depend on the legal form. `company_missing_proofs` reads the company's type, so
  `admin_review_company`, the document-withdrawal trigger and the expiry sweep follow
  without change.
- **Upgrade.** `upgrade_to_company(company, name, registration_number)`: owner only, one
  way. It sets the registered name, and a verified individual goes back to `pending`
  (the name change lapses it through 37's trigger, and `revalidate_company_verification`
  now finds `company_registration` missing). Company to individual is an administrator
  action, deferred: no UI.
- **Signup.** An operator chooses "On my own" or "As a registered company". The choice
  travels as `operator_type` in the signup metadata; `handle_new_user` whitelists it and
  treats anything else (including older clients) as `company`, which is what every
  operator got before. The business name is optional for an individual (a trading name)
  and required for a company.
- **Existing operators.** The live company stays `company`. Its required proofs do not
  change, its grandfathered `verified` status is untouched, and nothing it sees changes.
  It can add a team straight away.

### 2. Roles and permissions

The existing enum values are kept: `owner`, `manager`, `staff`.

| Permission (`company_permission_min_role`) | owner | manager | staff |
|---|:-:|:-:|:-:|
| `view`: boats, bookings, maintenance, captains, reviews, company, documents, team | ✓ | ✓ | ✓ |
| `log_hours`: log operating hours, correct **own** entry (24 h, no service since) | ✓ | ✓ | ✓ |
| `assign_captains`: assign a roster captain to a confirmed booking | ✓ | ✓ | ✓ |
| `edit_boats`: register, edit, propose changes, photos, availability, submit for review | ✓ | ✓ | |
| `manage_bookings`: confirm, decline, mark deposit and completed, cancel | ✓ | ✓ | |
| `complete_maintenance`: record a service, dismiss maintenance alerts | ✓ | ✓ | |
| `manage_captains`: add, edit, remove captains | ✓ | ✓ | |
| `reply_reviews`: write or edit the public reply | ✓ | ✓ | |
| `manage_documents`: upload and tidy verification documents | ✓ | ✓ | |
| `edit_company`: company details, upgrade to company | ✓ | | |
| `manage_members`: add, change role, remove | ✓ | | |
| `delete_boats` | ✓ | | |

Reasoning: staff are the crew and the desk. They need to see everything to do the day's
work, log the hours they ran (which only ever pushes a boat *towards* a service) and
dispatch a captain. Anything that commits the business to a guest, changes what tourists
see, lowers a maintenance counter, speaks for the business in public, or files legal
proof is a manager's. Anything that changes who the business is, who is on it, or
destroys a listing is an owner's.

**Last-owner guard.** A company always has at least one owner. Demoting, removing or
leaving as the last owner is refused (`assert_not_last_owner`) with a message that says
what to do. Each membership RPC locks the company row first, so two owners demoting each
other at the same moment are serialised.

### 3. Access model

- **One helper, used everywhere.** `has_company_permission(company, permission)` and
  `has_boat_permission(boat, permission)` for RPCs and write policies; the
  set-returning `my_company_ids()` / `my_boat_ids()` for read policies, written as
  `company_id in (select public.my_company_ids())`. That is an uncorrelated subquery, so it
  runs once per statement and is hashed, which is the `(select auth.uid())` rule applied
  to membership; a per-row definer call on every booking or review a member lists is
  avoided. An unknown permission name returns null and fails closed.
- **Why not per-table rules:** the audit found exactly that pattern drifting (reads on
  `owner_id`, some writes on any member). One matrix makes every table answer the same
  question, and a role change is a one-line edit.
- **Why not `is_boat_manager` with a minimum role:** it answers per boat, but read
  policies need a set to stay fast, and companies and documents are not boats. It is
  kept, redefined as `has_boat_permission(boat, 'view')`, for anything outside the
  database that still calls it.
- **`boats.owner_id` = the accountable owner.** It is what `public_boats` shows tourists
  as the operator (name, phone) and what the submit gate checks, so it must always be an
  `owner` member. New boats are given to the team's longest-standing owner
  (`stamp_boat_company`); for an individual or a one-owner team that is the caller, as
  before. When an owner is demoted, removed or leaves, their boats pass to the next owner
  (`hand_over_boats`). It grants nothing: an owner who leaves loses the boats.
- **`boats.created_by`** (new) records who registered the boat, for the "Added by"
  indicator. Display only; `ON DELETE SET NULL` so it never blocks an account purge.
- **`boats.company_id`** is NOT NULL from now on. `stamp_boat_company` fills it from the
  creator's (single) workspace.
- **Captains** belong to the team (`captains.company_id`, NOT NULL); `owner_id` records
  who added them. `assign_captain` requires the captain to be on the boat's team.
- **Maintenance alerts** are visible to the whole team (by boat, not by recipient), and
  dismissing one needs `complete_maintenance`, since it clears it for everyone.

### 4. Membership flow

- **Add by e-mail (owners only), existing operator accounts only.** The account must have
  profile role `owner` (an operator account), not be closing, and not be a hotel, agency,
  tourist or admin: roles change only through a super administrator, and an operator
  account has accepted the operator agreement at signup. Every operator signup creates a
  workspace, so the person's own *empty* workspace (no boats, documents, captains or other
  members) is dissolved as they join; a workspace with any of those is not, and the add is
  refused with a message telling them to close it first. "No account", "not an operator"
  and "closing their account" give one message, so the form cannot be used to learn which
  addresses belong to tourists.
- **Pending invites are deferred.** Today the new person signs up as an operator ("On my
  own"), then an owner adds them. An invite table accepted at signup would let anyone who
  registers an invited address before confirming it land in a team; doing it properly
  means accepting on first sign-in after e-mail confirmation, with expiry and revocation.
  Worth a follow-up once teams exist in practice.
- **One workspace per person** (unique index on `company_members.profile_id`). 28c
  anticipated several; nothing in the product can create that today and the portal has no
  workspace switcher. Deferred, not ruled out.
- **Role changes and removal** are owner actions; **leaving** is open to every member
  (no consent gate, so it is always possible). The sole member of a workspace cannot leave
  it (there is no team to leave).
- **What happens to a leaving or removed member's work:** boats they held pass to another
  owner; captains they added, hours they logged, services they recorded, documents they
  filed and replies they wrote stay with the team, still attributed to them. They lose
  access immediately (including to company documents they uploaded) and get a fresh,
  empty individual workspace (`create_personal_workspace`), so every operator account
  keeps exactly one workspace and can later be added to another team.

### 5. Verification and trust

- Company verification stays per company and is what tourists see
  (`public_boats.operator_verified`, unchanged).
- A member's own profile verification does **not** gate team work. The owner who added
  them vouches for them, and an administrator still reviews every boat before it goes
  live. The submit gate in `submit_boat_for_review` now checks the **boat's accountable
  owner's** profile instead of the caller's: the account that holds the boat must be
  verified, exactly as before for an individual.
- The portal shows the account-verification banner and uploader only to the team's
  accountable (longest-standing) owner, the person whose verification still matters.

### 6. Account deletion

- `account_active_booking_count` counts a booking on a boat the user holds only when
  nobody on the team could take the boat over (`company_successor`). For an individual,
  unchanged.
- `purge_deleted_accounts` hands boats **and captains** to `company_successor`: another
  owner if there is one, otherwise the longest-serving manager, then staff, who is made an
  owner. A team is never left ownerless by a purge and a deletion is never blocked forever
  by a team. With no successor, boats leave the listing and captains are deleted, as
  before. The deletion copy is updated to say this.
- Documents the deleted person uploaded are still deleted (they may be personal data); if
  one was a current proof, 28e's trigger lapses the company to `pending`, honestly.

### 7. Migration path

Migration 40 is additive and backfills before it constrains: type and columns, backfill
(no live row changes meaning: `created_by := owner_id`, the company stays `company`),
`NOT NULL` on `boats.company_id` and `captains.company_id`, the unique membership index
(after an explicit duplicate check that aborts with a clear message), helpers, policies
via `ALTER POLICY` (names, commands and roles unchanged), RPC bodies from their live
definitions, membership RPCs, signup and purge. Signatures of existing RPCs do not
change, so no old overloads are left behind.

**Rollback.** Down-migration in reverse order: restore the 39-era bodies of the replaced
functions and the 28/32/33 policy expressions (all recorded in their migrations and in
this repository's history); drop the membership RPCs, helpers, `captains_*` and
`boat_images_*_editor` policies (recreate `captains_owner_all` and
`boat_images_write_own`), `regdocs_select_company`, the `company_members` triggers and the
unique index (recreate `company_members_profile_idx`); restore the old grants on
`captains` and `company_members`. The new columns can stay (nullable `created_by`,
defaulted `operator_type`) or be dropped after `alter column ... drop not null`. Any team
created after apply would need its extra members removed first, since the old model reads
by `owner_id` and they would see nothing.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| Separate `individuals` table beside `companies` | Clear names | Two tenant models; every policy, RPC and screen doubles; upgrading means moving rows between tables |
| Individuals without a workspace (boats keyed on `owner_id` only) | Nothing to migrate for sole traders | Two access paths forever, which is the drift the audit found |
| **`operator_type` on one tenant (chosen)** | One model, one access rule, upgrade is a column change | An individual's "company" row is a slight misnomer; the UI says "workspace" / "business" |
| Per-table ownership rules | Each table tuned on its own | Already drifting; a missed path is a data leak |
| `is_boat_manager(boat, min_role)` everywhere | One function | Per-row definer calls in read policies; does not fit companies or documents |
| **Permission matrix + set helpers (chosen)** | One matrix; fast reads; fails closed | Two helper shapes to learn (boolean for writes, set for reads) |
| `owner_id` as "created by", access through the company | Simple meaning | `public_boats` would show a manager or staff member as the operator to tourists |
| **`owner_id` = accountable owner, plus `created_by` (chosen)** | Tourist view unchanged; submit gate keeps its meaning | Ownership moves on demotion or departure, which the RPCs must remember (`hand_over_boats`) |
| Add any account (tourist too) and convert it to an operator | Easiest for the inviter | Silent role change outside super-admin control; skips the operator agreement |
| Pending e-mail invites accepted at signup | Smoothest onboarding | Unconfirmed-address takeover risk; needs expiry, revocation, a table and UI. Deferred |
| Block account deletion for the last owner of a team | Explicit | Privacy-hostile: a team could keep someone's data forever |
| **Promote a successor at purge time (chosen)** | Deletion always completes; team keeps an owner | The promoted manager gains owner powers without a human deciding it |

## Consequences

**Positive:**
- Sole traders sign up as themselves and need three proofs, not four.
- Companies can bring in managers and crew, each with only what their job needs.
- Every owner-scoped read and write answers one question through one matrix; staff
  read-only is enforced by the server, not just hidden in the UI.
- Reads stay set-based and fast; `boat_images` writes no longer cost every tourist read.
- Membership changes are audited (`audit_company_members`).

**Negative:**
- One workspace per person for now; a consultant working for two operators needs two
  accounts.
- New staff must sign up first; there is no invite e-mail yet.
- Maintenance alerts are shared: dismissing one dismisses it for the team.
- Company-to-individual needs an administrator.

**Risks:**
- **Enumeration.** An owner can learn whether an e-mail belongs to an operator account.
  Mitigated by one message for every non-operator case and by owners-only access; no rate
  limit exists yet.
- **A missed path.** Mitigated by a catalogue query after apply (see the verification
  list in the batch report): every remaining `owner_id = auth.uid()` reference is listed
  and justified.
- **Ownership hand-over** moves `public_boats.operator_name` / `operator_phone` to the next
  owner's profile when an owner leaves a multi-owner team. Correct, but visible to
  tourists; follow-up: show the company name as the operator.
- **Automatic promotion** at purge could give owner powers to a staff member. Only when no
  owner or manager remains, and the audit log records it.
- **Storage.** A leaving member keeps read access to the files under their own
  `registration-docs` folder (the rows are hidden from them). Low sensitivity (they
  uploaded them); closing it needs a path layout change.

## References
- Migrations 28, 28b–28e (tenants, verification lifecycle), 32 (`is_boat_manager`),
  33 (account deletion), 36–39 (conventions and live bodies), 40 (this decision).
- ADR-001 (guest booking edits), which marked the owner checks this ADR replaces.
