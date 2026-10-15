# ADR-003: Partner and operations policies (cancellations, verification, agreements, waivers, commission and account hygiene)

**Date:** 2026-10-15
**Status:** Proposed. Each section is ready to build once the owner confirms the open numbers
marked **Owner decision**. All legal text is a draft for review by a legal practitioner
registered in Zimbabwe, like `terms.md` and `privacy.md`.

## Context

The owner asked: "On all the questions you asked, carry out research on how other companies do
it, like MSC, and implement." This record answers the 13 open product questions from the hotel
and agency portal QA, ADR-001 and ADR-002. Each answer compares MSC Cruises (the primary
reference) with at least two other booking businesses, then fits the result to this product.

### What makes Kariba Lake Connect different from the references

1. **The platform never holds the guest's money.** The deposit (at least 20%) is paid to the
   operator after confirmation, and the balance is paid on the day (`terms.md`, "Payments").
   MSC, Viator, Booking.com and Click&Boat take payment and can refund the guest themselves.
   We cannot. Anything we "decide" about a refund is a rule the operator has to carry out, which
   we can only **display, record, chase and enforce through listing suspension**. Since the
   operator holds only the deposit before the trip, a cancellation fee above the deposit cannot
   be collected in practice.
2. **Zimbabwean law already sets a floor.** The draft terms promise a penalty-free 7-day
   cancellation for online bookings under the Consumer Protection Act, a full refund within 14
   days in that case, no fee for death or hospitalisation, and a full refund when the operator
   cancels. Any tier schedule sits on top of these rules and never below them.
3. **Registration regime.** Under section 36 of the Tourism Act [Chapter 14:20] every
   "designated tourist facility" must register with the Zimbabwe Tourism Authority (ZTA). The
   ZTA e-registration portal lists the documents per category (fetched, reference Z1): a common
   set for every operator (certificate of incorporation, CR14, bank letter, public liability
   insurance of at least USD 5,000, ID of directors and others), plus extras: **travel agencies**
   need an office lease of at least one year and **membership of a travel agency association**;
   **boats and houseboats** need a Parks & Wildlife permit, an Inland Waters permit and a launch
   master certificate for the captain; **accommodation** needs a council or RDC licence. ZTA
   set a 28 February 2026 deadline and began inspections and closures of unregistered facilities
   (Z2, Z5). A Tourism Bill (H.B. 7, 2025) would make licensing mandatory; whether it has been
   enacted could not be confirmed (Z4).
4. **Connectivity and channels.** There is no e-mail or SMS channel for bookings yet. Supabase
   sends only auth e-mails. Hotel guests and agency clients often have no account. A design
   that depends on a guest clicking an e-mail link will not work reliably; one that uses the
   booking reference, the `/track` page and a WhatsApp share will.
5. **Scale.** Live data: 1 operator company, 1 member, 3 boats, a handful of partner accounts.
   Build-now items must be cheap, and must start recording data (rates, cancellation facts)
   that cannot be reconstructed later.

### What exists today (from the migrations and source)

- `cancel_booking(p_booking_id)` (migration 41): the tourist, the operator team
  (`manage_bookings`), verified hotel or agency staff of the booking's organisation, and admins
  may cancel any `requested`, `confirmed` or `deposit_paid` booking, at any time before
  `completed`, including after the trip date. No reason, no time, no actor and no fee are
  recorded on the booking (the audit log has the actor).
- `boats` has no cancellation policy. `bookings` has no `cancelled_at`, `deposit_paid_at`,
  `completed_at`, commission rate or refund state.
- `hotels.commission_rate` and `agencies.commission_rate` (numeric, 0 to 30, default 8) are
  edited by admins. `partners.service.ts` notes "the portal never fetches the commission rate".
  There is no operator commission rate anywhere, and no statements.
- `hotels.is_verified` / `agencies.is_verified` actually mean "active" (migration 37 uses
  `is_verified = false` to deactivate).
- Partner verification: `admin_review_account(... 'verified')` only checks that the account has
  **at least one** row in `verification_documents`, of any kind and any review state.
  Operators need an approved, unexpired document of every required kind (28d, 28e, ADR-002).
- `operator_agreement` v1 applies to roles `owner` and `hotel` (`18_add_terms_and_consent.sql`),
  and `Signup.tsx` asks owners and hotels to accept it. Agencies accept none. Its text is about
  honouring confirmed bookings, which is an operator duty.
- `create_booking` requires the current `booking_waiver` and records a `consent_records` row
  (context `booking`) for the **caller**. For a hotel or agency booking that caller is the staff
  member, not the guest.
- `PartnerBookingList` shows the captain to agencies but not to hotels. `privacy.md` says guests
  see the assigned captain's name and phone.
- `BoatForm` shows "Total hours so far" and "Hours at last service" as editable on an existing
  boat. The save ignores them; hours change only through Log hours and Record a service.
- `admin_schedule_account_deletion` (migration 38) uses the same 30-day window as a self
  deletion, and the user can cancel it from the Account page.
- `boat_images.uploaded_by` has a client INSERT column grant (migration 38), so any value can be
  sent.
- Team membership (ADR-002): owners add existing operator accounts only. Pending invites were
  deferred. Company to individual was left to administrators and not built.

### Research method and limits

WebFetch returned **HTTP 401 for every msccruises.\* page and PDF** tried (msccruises.com,
.co.uk, .com.au, .ie and the Gulf-market PDFs), and 403 or 429 for several mirrors (Expedia,
Orbitz, Cruise Critic). msccruises.co.za did not appear in any search result. MSC facts below
therefore come from **search-engine extracts of MSC's own UK, Ireland, Australia/NZ, Israel and
Gulf booking terms**, and from trade press for MSC Book and commission. Each reference is marked
[fetched] or [search extract]. No current MSC South Africa trade terms or commission card were
found. Treat every MSC number as indicative and confirm it with MSC South Africa's trade team if
it matters.

Not found at all: GetYourGuide supplier terms, Rhino Safari Camp terms or agent rates, Wilderness
Safaris' own agent terms (a Virtuoso page appears to quote them), a TBCSA membership or trade
verification standard, and the exact name or membership rules of Zimbabwe's travel agent
association (a LinkedIn post names an "Association of Zimbabwe Travel Agents" under the Tourism
Business Council of Zimbabwe; unverified).

## Decision

**Summary.** Partners act as the booker of record, as a travel agent does for MSC. They may
cancel, under the same fee rules as the guest. Those rules are a small set of platform-defined
cancellation policies that the operator picks per boat. The policy is snapshotted on each
booking, capped at the deposit and always subject to the Zimbabwean consumer floor. The platform
records the fee and refund it expects and chases the operator, but does not move money.
Partners are verified on approved, unexpired, typed documents (ZTA registration first) and sign
a partner agreement of their own. The guest confirms the waiver themselves through `/track`,
after the partner attests. Commission becomes a dated, snapshotted, statement-based ledger that
both operators and partners can see. Hygiene items follow server-stamping and fail-closed rules.

Tags used below:
- **Build now:** next implementation batches (see "Implementation batches" at the end).
- **Build later:** specified here; build when the trigger named in the item happens.
- **Policy text only:** wording for terms, privacy policy, agreements or the admin runbook.
  No code.

---

### 1. Partner cancellations

**What others do.**
- *MSC.* A cancellation must be made in writing to MSC **or via the passenger's agent**. The
  agent's request is the passenger's cancellation and carries the same charges. Charges rise by
  days before departure and are "or loss of deposit, whichever is greater". The current UK
  cruise-only scale for sailings under 15 nights: deposit only at 76+ days, then 25% (75 to 56),
  40% (55 to 36), 60% (35 to 15), 80% (14 to 6) and 100% (5 to 0). A late notice or a no-show
  counts as 100% (M1, M2). Under the AU/NZ terms, a booking made through an agent is amended
  through the agent, and refunds go back to the agent where applicable (M3). Other markets use
  different scales (Israel: a flat per-person fee at 60+ days, rising to 100% at 5 to 0 days; M6).
- *Royal Caribbean and Carnival.* Similar sliding scales. Carnival adds non-refundable deposits on
  promotional fares and treats replacing every original guest as a full cancellation (C3).
- *Viator.* Three policy types: Standard (free cancellation up to 24 hours before, about 85% of
  products), Custom (supplier-defined day windows with a percentage refundable) and All sales
  final. Partners call a `cancel-quote` endpoint to show the refund **before** cancelling.
  Suppliers may cancel; the customer then gets an alternative or a refund (V1, V2).
- *Boat marketplaces.* Click&Boat lets the owner pick Flexible (full refund up to 24 hours),
  Moderate (70% back up to 10 days), Strict (60% back up to 30 days) or Custom, and keeps its
  fees; when the owner cancels, the renter gets a full refund (B1, B2). SamBoat offers Flexible,
  Zen (default), Moderate, Strict and Personalised (B4). Boatsetter offers Flexible (free until
  24 hours), Moderate (free until 5 days, 50% between 5 and 3 days) and Strict (free until 30
  days, 50% between 30 and 15 days), and carries the policy over if the date is edited (B5).
- *Kariba houseboats.* MV Matusadona charges a USD 100 admin fee from confirmation to 90 days,
  25% of the total from 90 to 31 days and 100% from 30 to 0 days, with cancellations in writing
  (K2). Houseboats on Kariba keeps the non-refundable deposit on any cancellation, takes the full
  charter fee inside 6 weeks, and gives no refunds for no-shows (K1). Other Kariba operators
  refund less a 10 to 20% handling fee, sometimes only if the boat is re-let (K3).
- *Booking.com.* Commission is charged only on what the guest actually pays on a cancellation
  (zero for a free cancellation) and normally not on no-shows (P1).

**Decision.**
1. **Who may cancel what.**

   | Booking state | Guest (tourist account) | Partner staff (verified, booking's own hotel or agency) | Operator team (`manage_bookings`) | Admin |
   |---|---|---|---|---|
   | `requested` | Yes, no fee | Yes, no fee | Declines instead (existing) | Yes |
   | `confirmed`, `deposit_paid`, before the trip starts | Yes, policy fee | Yes, policy fee, same as the guest | Yes, reason required, full refund | Yes, reason required |
   | After the trip start time | No (contact the operator) | No | Only as "no-show", "weather or safety" or "breakdown" | Yes |
   | `completed`, `declined`, `cancelled` | No | No | No | No |

   A partner's cancellation is the guest's cancellation for fee purposes, as at MSC. The partner
   says why: "the guest asked" or "our error". The fee is the same either way. Who makes the
   guest whole after a partner error is a matter between the partner and its guest (partner
   agreement, section 3).
2. **Cancellation policies.** There are three presets, chosen per boat by the operator, with
   Moderate as the default. They are kept to three on purpose: guests and desk staff can compare
   them, and the platform can compute them. Days are calendar days from today (Africa/Harare)
   to `start_date`. The percentage is of the **deposit**, which is the only money the operator
   holds before the trip.

   | Preset | Full deposit refunded | Operator keeps 50% of the deposit | Operator keeps the whole deposit |
   |---|---|---|---|
   | Flexible | 2+ days before | n/a | Under 2 days, or no-show |
   | **Moderate (default)** | 14+ days before | 3 to 13 days | Under 3 days, or no-show |
   | Strict | 30+ days before | 8 to 29 days | 7 days or less, or no-show |

   **Owner decision:** confirm or adjust the day bands. They sit between Click&Boat/Boatsetter
   (owner-run boats) and Kariba houseboat practice (30 to 45 days for multi-day charters).
   Strict suits houseboats; Flexible suits hourly sundowner boats.
3. **Overrides, applied in this order, always to the guest's benefit:**
   1. The operator declines or cancels, or an admin cancels for an operator-side reason (weather
      or safety, breakdown, operator unavailable, operator breach): the full deposit is
      refunded. The operator may offer another date or boat, which the guest is free to refuse
      (existing terms).
   2. The booking was made 7 days ago or less (Consumer Protection Act cooling-off, as the terms
      already state): no fee. **Legal review flag:** whether the cooling-off applies to a trip
      that starts within those 7 days.
   3. Death or hospitalisation of the guest or immediate family (existing terms): no fee. The
      canceller ticks a "compassionate reason" box, and the operator may ask for evidence
      through support.
   4. The deposit has not been paid (`confirmed`, not `deposit_paid`): no fee, because nothing
      can be withheld and the platform never asks a guest to pay a fee.
4. **Snapshot.** The boat's preset is copied to the booking when it is created and stays fixed,
   as on Viator and Boatsetter. Changing a boat's preset affects only new bookings. Existing
   bookings keep `null` ("operator's own terms, booked before cancellation policies"), and the
   UI shows the old terms text for them.
5. **Quote before cancel.** A read-only quote (the Viator `cancel-quote` pattern) is shown in the
   confirm dialog, for example: "Under the Moderate policy the operator keeps USD 40 of the USD
   80 deposit and refunds USD 40 by 29 October."
6. **Refund tracking, not refunding.** On a cancellation with money due back, the booking
   records `refund_due_amount` and `refund_due_by` (cancellation + 14 days, which matches the
   CPA cooling-off promise, applied to every refund). The operator marks it refunded. The guest
   or partner can report "not received", which goes to an admin queue. Enforcement is the
   existing lever: suspend the operator's listings (terms, "Refunds are paid by the operator").
7. **No commission on cancelled bookings**, either platform or partner (matches the terms'
   "commission on completed bookings" and Viator's agent rule). We do not follow Booking.com in
   charging commission on retained fees: it is hard to verify off-platform. Revisit in a later
   ADR if retained deposits become material.

**What to build.**
- **Build now (DB):** enum `cancellation_policy` (`flexible`, `moderate`, `strict`).
  `boats.cancellation_policy cancellation_policy not null default 'moderate'`, editable with
  `edit_boats` permission, outside listing review because it only applies to new bookings.
  `bookings.cancellation_policy cancellation_policy null`, set by `create_booking` (through the
  ADR-001 helper) from the boat and never updated. Guard it in `guard_booking_reference` or a
  sibling trigger. *Why now:* every booking created without a snapshot is one more booking on
  "operator's own terms".
- **Build now (DB):** new booking columns: `cancelled_at timestamptz`, `cancelled_by uuid`
  (references profiles, on delete set null), `cancelled_by_party` enum (`guest`, `partner`,
  `operator`, `admin`, `system`), `cancel_reason` enum (`guest_request`,
  `guest_compassionate`, `partner_error`, `guest_no_show`, `weather_safety`, `boat_breakdown`,
  `operator_unavailable`, `operator_breach`, `other`), `cancel_note text`
  (500 characters at most), `cancellation_fee_amount numeric(10,2)`,
  `refund_due_amount numeric(10,2)`, `refund_due_by date`, `refund_status` enum (`none`,
  `due`, `refunded`, `disputed`, `resolved`) default `none`, `refund_marked_at`,
  `refund_marked_by`, and `deposit_paid_at` (stamped by `owner_set_booking_status`). Stamp the
  cancellation and refund columns only inside the RPCs. There is no client UPDATE grant on
  `bookings`, so no guard trigger is needed beyond the audit that already exists.
- **Build now (DB):** `cancellation_quote(p_booking_id) returns table(policy, days_before,
  rule_applied, deposit_amount, deposit_paid boolean, fee_amount, refund_amount, refund_due_by)`.
  It is SECURITY DEFINER with the same visibility test as `cancel_booking`, and it computes the
  tiers and overrides above in one place.
- **Build now (DB):** replace `cancel_booking(uuid)` with `cancel_booking(p_booking_id uuid,
  p_reason cancel_reason default null, p_note text default null, p_compassionate boolean default
  false)` and drop the old one-argument function, as ADR-001 did. Rules: the matrix above (the
  caller's party is derived, never passed); `p_reason` is required for operator and admin
  callers; after `start_date + coalesce(start_time, '00:00')` (Harare) only the operator
  (reasons `guest_no_show`, `weather_safety`, `boat_breakdown`) and admins may cancel; fee and
  refund come from the same function as the quote; `refund_status := 'due'` when
  `refund_due_amount > 0`.
- **Build now (DB):** `operator_mark_refunded(p_booking_id, p_note)` (`manage_bookings`, only when
  `refund_status = 'due'`); `report_refund_not_received(p_booking_id)` (the tourist or verified
  staff of the booking's partner, only after `refund_due_by` or once it is marked refunded; sets
  `disputed`); `admin_resolve_refund(p_booking_id, p_outcome, p_note)` (`resolved`, with a note).
  An admin view lists `refund_status in ('due','disputed')` past `refund_due_by`.
- **Build now (frontend):** a cancellation-policy select with plain-language tiers on BoatForm;
  the policy shown on BoatDetail and in the booking modal before the guest sends a request; a
  cancel dialog in My Trips, the hotel and agency portals and the owner bookings page that loads
  the quote, asks for the reason (partner: "Guest asked" or "Our error"; operator: required
  list) and the compassionate box; cancelled cards show "Cancelled by the guest / by
  {Hotel name} / by the operator, {date}" with fee, refund and refund status; owner page buttons
  "Mark refunded" and "Report not received"; `/track` shows cancellation and refund status
  (extend `track_booking`'s return columns: `cancelled_at`, `cancelled_by_party`,
  `refund_due_amount`, `refund_status`, `cancellation_policy`).
- **Build later:** a `no_show` booking status and a "no-show" button for the operator. Interim:
  operator cancellation with reason `guest_no_show`. *Trigger:* when operators complain that
  no-shows sit as cancellations in their statistics.
- **Build later:** a custom per-boat policy (Viator Custom, Click&Boat Custom). *Trigger:* a
  verified houseboat operator needs a tier the presets cannot express.
- **Policy text only:** rewrite `terms.md` "Cancellations, changes and refunds" around the three
  presets, the overrides, partner cancellations ("a hotel or agency that booked for you may
  cancel for you; the same fees apply") and the 14-day refund and dispute route. Add to the
  operator agreement: honour the booking's snapshotted policy; refund within 14 days; mark
  refunds honestly; repeated unpaid refunds lead to suspension.

### 2. Partner verification

**What others do.**
- *ZTA (law, Zimbabwe).* A travel agency registering with ZTA needs the common documents plus a
  one-year office lease and membership of a travel agency association. Accommodation needs a
  council or RDC licence. Registration is a statutory requirement now being enforced (Z1, Z2,
  Z5).
- *ASATA (South Africa).* Membership is voluntary but used as the trust signal. The board vets
  applications monthly. Criteria include no insolvent directors, at least one experienced
  full-time staff member and audited financial statements. A buyer checks the public member
  directory (A1, A2, A3). IATA accreditation governs air ticketing through BSP, not tours or
  cruises (A2 context).
- *MSC South Africa and cruise lines.* No current MSC SA agent onboarding rules were found.
  US cruise-adjacent trade programmes ask for an IATAN or CLIA card to pay agent commission
  (example: Wilderness Travel, W3). Lodges such as Onguma make agent (STO) rates valid only when
  "a registered agent or tour operator" books and pays (L2).
- *Expedia TAAP and Viator agents.* An agency registers and is approved; agency managers must
  add banking and tax details before payouts (P2, V3).

**Decision.**
1. A hotel or agency account is verified only when its **organisation** holds an **approved,
   unexpired document of every required kind** for its type, the rule ADR-002 uses for
   operators. An uploaded but unreviewed file is not enough.
2. **Document sets:**

   | Kind (`partner_document_kind`) | Hotel or lodge in Zimbabwe | Travel agency in Zimbabwe | Agency outside Zimbabwe |
   |---|:-:|:-:|:-:|
   | `business_registration`: certificate of incorporation and CR14 (or home-country equivalent, for example CIPC) | Required | Required | Required |
   | `zta_registration`: ZTA certificate as a designated tourist facility | Required | Required | Not applicable |
   | `association_membership`: travel agency association (ZTA requires it), or ASATA, IATA or a national association abroad | n/a | Required | Required |
   | `signatory_id`: national ID or passport of the director or general manager who signs the partner agreement | Required | Required | Required |

   IATA alone is **not** required: most tour and lodge agents are not IATA ticketing agents, and
   ZTA already requires association membership. A council licence is not demanded separately,
   because ZTA registration of accommodation already depends on it.
   **Owner decision:** whether an agency abroad may book before it shows a Zimbabwean partner
   (ZTA's "external tour operator" category applies to operators running tours in Zimbabwe, not
   to agents selling from abroad).
3. **Lifecycle** as for operators (28e): an expired or withdrawn required document lapses the
   organisation. A lapsed organisation **cannot create new bookings**, but its staff keep read and
   cancel access to existing ones, so guests are not stranded.
4. **Grandfathering.** Partners verified before the migration get `proofs_due_by` = apply date
   + 60 days. Until then the booking guard ignores missing proofs, and the portal shows a banner
   listing what is missing.

**What to build.**
- **Build now (DB):** enum `partner_document_kind` (`business_registration`, `zta_registration`,
  `association_membership`, `signatory_id`). It is deliberately **not** values added to
  `company_document_kind`, because `required_proof_kinds('company')` means "every value of that
  enum", and adding values would tighten every operator.
- **Build now (DB):** `verification_documents` gains `partner_doc_kind partner_document_kind`,
  `hotel_id uuid references hotels`, `agency_id uuid references agencies`, plus
  `check (doc_kind is null or partner_doc_kind is null)` and
  `check (hotel_id is null or agency_id is null)`. The insert column grant adds
  `partner_doc_kind` only. `hotel_id` and `agency_id` are stamped by the server: at upload from
  the caller's linked organisation, and at `admin_verify_hotel` / `admin_verify_agency` for the
  applicant's own unlinked documents. Read policy for verified staff of the same organisation
  mirrors `regdocs_select_company` from ADR-002.
- **Build now (DB):** `hotels.country` and `agencies.country` (`char(2) not null default 'ZW'`),
  `hotels.proofs_due_by` / `agencies.proofs_due_by date`.
  `partner_required_kinds(kind text, country char(2))` and `partner_missing_proofs(kind text,
  org_id uuid) returns setof partner_document_kind` (approved, `expires_at is null or >=
  current_date`).
- **Build now (DB):** `admin_verify_hotel`, `admin_verify_agency` and `admin_review_account(...,
  'verified')` for a hotel or agency role refuse while `partner_missing_proofs` is non-empty
  (the message names the missing kinds). `guard_hotel_booking` and the agency branch of
  `create_booking` refuse new bookings when proofs are missing and `proofs_due_by` is null or
  past. Read, cancel and edit-request paths are unchanged.
- **Build now (frontend):** the partner portal document uploader with a kind select, expiry date
  and per-kind status chips (missing, in review, approved, expired); a grandfathering banner
  with the due date; the admin verification screen showing the partner checklist with approve
  and reject per document, reusing the operator document review UI.
- **Build later:** a nightly sweep that e-mails or notifies before a document expires (no
  channel yet). *Trigger:* a notification channel exists.
- **Policy text only:** `terms.md` "How operators and partners are verified": list the partner
  documents. `privacy.md`: partner verification documents and the signatory's ID are sensitive
  and processed with written consent, like a director's ID. Admin runbook: check ZTA certificates
  against ZTA's registered list when ZTA publishes one, and ASATA membership against
  asata.co.za's member directory.

### 3. Partner agreements

**What others do.**
- *Viator supplier agreement* (fetched, V2). It covers net rates and rate parity; the platform
  sets the retail price; monthly remittance within 21 business days with a USD 50 minimum;
  customers cancel through the platform, not the supplier; licences and public liability
  insurance; mutual liability caps and indemnity; customer data used **only** to provide the
  booked product, with no marketing without the customer's own permission; brand licence; no
  scraping; 30-day termination and immediate deactivation for breach. Viator pays any travel
  agent commission (s.6.1).
- *MSC.* A trade relationship sits under a commercial agreement, and MSC has threatened to take
  sailings off agents, or withdraw their agreements, if they discount (M9). The booker confirms
  that every named passenger agreed to the terms and that they have authority to accept for
  them (M5).
- *Booking.com and Expedia TAAP.* Agreement-level commission, monthly invoicing, banking and tax
  form before payouts (P1, P2).

**Decision.** Agencies **and hotels** sign a **Partner Agreement**. The operator agreement stops
applying to hotels, because its content is an operator's duties. Contents (draft for legal
review):
1. **Appointment.** Non-exclusive booking partner. The partner books on the platform for named
   guests. It is not the operator's agent and cannot vary an operator's terms.
2. **Booking duties.** Accurate guest name and phone; the guest's permission to share them
   (CDPA); give the guest the booking reference, the boat's cancellation policy and the waiver
   link (section 4); keep the guest informed of changes and cancellations.
3. **Cancellations.** Partner cancellations follow section 1. The partner is responsible to its
   guest for fees caused by its own error.
4. **Pricing.** The partner must not present any price other than the operator's published price
   as the operator's price. It may charge its own service fee only if it discloses it separately
   to the guest. **Owner decision:** allow disclosed service fees (recommended; local hotels
   commonly add one) or forbid them.
5. **Commission.** The rate is on the partner account and shown in the portal. It is earned only
   on completed bookings, snapshotted at confirmation, listed on a monthly statement and paid
   within 30 days after the platform receives the operator's commission for that booking.
   Nothing is paid on cancelled bookings or no-shows. Errors are adjusted on the next
   statement. Rate reductions need 30 days' written notice, and increases may apply at once (see
   section 12). Banking details are required before payment.
6. **Client data.** The partner and the platform are each responsible for their own processing
   under the Cyber and Data Protection Act. The partner uses platform data only for the booking;
   no scraping, export for marketing or resale; it reports breaches to the platform within 24
   hours.
7. **Brand.** A limited licence to use the Kariba Lake Connect name and logo to promote bookings
   on the platform. The partner may not imply that it is the operator or the platform, and may
   not bid on the platform's name in paid search.
8. **Liability.** Each party is liable for its own acts. The platform's cap matches `terms.md`
   (commission paid in 12 months). The partner indemnifies the platform for its data misuse and
   misrepresentation.
9. **Term.** Either party may end the agreement on 30 days' notice. The platform may suspend at
   once for fraud, unpaid refunds owed to the partner's guests through the partner's own fault,
   or lapsed verification. Commission earned before the end is still paid.

**What to build.**
- **Build now (DB):** `alter type legal_doc_type add value 'partner_agreement'` in its own
  migration step (an enum value cannot be used in the transaction that adds it); insert
  `partner_agreement` v1 (the text above, marked draft) with `is_required = true` and
  `applies_to_roles = '{hotel,agency}'`. Narrow the **current** `operator_agreement` row to
  `applies_to_roles = '{owner}'` in place, with no new version. The text does not change, so
  owners are not asked to re-accept, and hotels stop being asked. Existing hotel and agency
  accounts then see `partner_agreement` as an outstanding consent at next sign-in, through the
  existing `has_outstanding_required_consent` gate.
- **Build now (frontend):** `Signup.tsx`: `needsOperator` becomes `role === 'owner'`; a new
  `needsPartner = role === 'hotel' || role === 'agency'` shows and records `partner_agreement`;
  `legal.service.ts` gets the new doc type and label.
- **Policy text only:** the agreement text (sections 1 to 9) for legal review, and a partner fee
  schedule page that states the rate, the statement cycle and payment terms.

### 4. Waivers accepted on behalf of others

**What others do.**
- *MSC.* The person making the booking confirms that every person named has agreed to be bound
  and that they have authority to accept on their behalf. The booker answers for the third
  party's breaches (M3, M5).
- *Cruise lines at check-in.* **Each adult accepts the cruise ticket contract personally** during
  online check-in (for themselves and their minor children, never for another adult). Anyone who
  has not done so accepts at the pier (C1). Royal Caribbean requires check-in with the ticket
  contract before boarding, otherwise manual check-in at the terminal (C1).
- *Kariba houseboats.* The hirer accepts the terms and the waiver of claims "on behalf of
  him/herself and all the passengers on board" (K1).
- *Activity platforms.* Waiver tools ask guests to sign at booking, send reminders until the
  activity, and fall back to a link or tablet on arrival (W1). Viator's own waiver handling was
  not found.

**Decision.** Two steps, neither of which blocks the booking:
1. **Partner attests at booking.** Partner staff tick: "I have {guest}'s permission to share their
   details, and I will give them the booking reference and ask them to accept the trip waiver."
   This is recorded as the **staff member's attestation**, not as the guest's acceptance.
2. **Guest confirms before the trip.** The lead guest opens `/track` (reference and phone, which
   already authenticates a guest without an account), reads the current waiver, types their name
   and accepts. The acceptance covers the group, as the houseboat model does. Per-adult
   acceptance, as cruise lines require, is too heavy for a two-hour boat trip and would depend
   on connectivity.
3. **Fallback at boarding.** If there is no guest acceptance by departure, the skipper has the
   lead guest sign the paper waiver, and the operator records "signed on board".
4. Everyone involved sees the status: "Waiver: accepted by {name}, {date}", "awaiting guest",
   or "signed on board". It shows on the operator, partner and `/track` views.
5. An edit under ADR-001 keeps the guest's acceptance unless the current waiver version changed.

**What to build.**
- **Build now (DB):** add `booking_on_behalf` to `consent_context`. `create_booking` records the
  staff member's consent row with that context for hotel and agency callers (unchanged
  `booking` for tourists). It also requires `p_on_behalf_attested boolean default false` to be
  true for partner callers. Partner callers pass it; tourists ignore it.
- **Build now (DB):** a table `booking_waiver_acceptances (id uuid pk, booking_id uuid not null
  references bookings on delete cascade, document_id uuid not null references legal_documents,
  waiver_version int not null, method text not null check (method in
  ('guest_account','guest_track','on_board')), accepted_name text not null check
  (length(btrim(accepted_name)) between 2 and 120), recorded_by uuid null references profiles on
  delete set null, accepted_at timestamptz not null default now())`. RLS: select for whoever can
  read the booking (same branches as `bookings_read_involved`); no client writes. Tourist
  bookings insert a `guest_account` row inside `create_booking`.
- **Build now (DB):** `guest_accept_waiver(p_reference text, p_phone text, p_version int,
  p_name text)`, callable by anon and authenticated with the same reference and phone match as
  `track_booking`. It accepts only the current waiver, only for `requested`, `confirmed` or
  `deposit_paid` bookings before the trip ends, and is idempotent. Also
  `operator_record_waiver_on_board(p_booking_id, p_name)` (`assign_captains`, so crew can do it).
  `track_booking` returns `waiver_status` and `waiver_accepted_name` (first name only).
- **Build now (frontend):** the attestation checkbox in the partner booking form; a "Send to
  guest" panel after a partner books: copy text and a `https://wa.me/?text=` share (no phone
  number in the URL) containing the reference and the `/track` link; an "Accept the waiver" step
  on `/track`; a waiver status chip on owner, partner and track cards; an owner "Signed on
  board" action.
- **Policy text only:** `terms.md` "Booking a trip": when a hotel or agency books, it confirms it
  has your permission and you accept the waiver yourself on Track a booking, or on board before
  departure. Operator agreement: no departure without a recorded or paper waiver. `privacy.md`:
  the waiver acceptance record (typed name, time) for partner bookings.

### 5. Commission visibility

**What others do.**
- *MSC Book.* A reporting dashboard with revenue and commission reports, and a "View Commission"
  option per booking showing commission per priced item (M7).
- *Expedia TAAP.* Estimated commission shown at booking (a tier symbol); the reporting tool shows
  each booking's earning status and why it is unpaid (missing tax form, below threshold).
  **Commission never appears on the traveller's voucher** (P2).
- *Viator agents.* Each payment comes with a remittance listing every booking and its commission;
  no commission on cancelled bookings (V3).
- *Booking.com.* A monthly invoice listing each reservation (P1).

**Decision.** Partners see their **current rate**, the **commission per booking** (an estimate
while requested, locked at confirmation, earned at completion, void on cancellation), and
**monthly statements** with payment status. Operators likewise see the platform's commission
rate, the commission per completed booking and their monthly statements. Commission is never
shown on guest-facing surfaces: `/track`, the "Send to guest" text, any print view. All verified
staff of a partner see it, as at TAAP agency accounts. On the operator side, owners and managers
see it, through a new `view_finances` permission; staff are crew and do not.

**What to build.**
- **Build now (DB):** `my_partner_terms() returns table(rate numeric, effective_from date,
  next_rate numeric, next_effective_from date)` for verified hotel and agency staff;
  `my_company_terms()` for operator members with `view_finances`. Add `view_finances` to
  `company_permission_min_role` (minimum role `manager`).
- **Build now (frontend):** a partner portal "Earnings" tab: rate card, a per-booking table
  (reference, trip date, price, rate, commission, status chip: Estimate / Locked / Earned /
  Void / On statement {month} / Paid), and statements once section 12's statements exist; a
  matching owner "Commission" tab. The per-booking amount is `price_total * rate / 100`, rounded
  to cents, from the snapshot columns in section 12. The Earnings tab must not reuse components
  that render on `/track`.
- **Policy text only:** partner agreement section 5 and the partner fee schedule.

### 6. Captain visibility

**What others do.** Kariba houseboat operators name their captains publicly (K2), and the ZTA
registers a master certificate for the captain (Z1). Boatsetter shows renters the captain's
profile and lets them pick or change the captain (B6). Cruise lines do not assign named crew to
a passenger. The privacy policy already tells guests they see the assigned captain's name and
phone.

**Decision.** One rule: **whoever holds the booking sees the assigned captain's name and phone**
once the booking is `confirmed` or `deposit_paid` and a captain is assigned, until the end of
the trip day. That is the tourist, verified staff of the booking's hotel or agency, and the
guest on `/track`. After that the name stays on the booking history and the phone is no longer
shown. Hotels need it as much as agencies (concierge and pick-up coordination); hiding it only
from hotels was an inconsistency, not a policy.

**What to build.**
- **Build now (frontend):** remove the `showCaptain` agency-only switch in `PartnerBookingList`;
  show the captain for both partner types under the rule above; hide the phone (not the name)
  after the trip day in every view.
- **Build now (DB):** `track_booking` returns `captain_name` and `captain_phone` under the same
  window. Add columns at the end of the return table and drop and recreate the function with
  grants, as migration 31 did.
- **Policy text only:** `privacy.md` "Who we share it with": hotels and agencies see the
  captain's name and phone for bookings they made, and so does anyone using Track a booking with
  the reference and phone, from assignment until the end of the trip day. The note on captains'
  details: operators must tell captains this.

### 7. The owner's boat form: hours fields

**Decision.** On an **existing** boat, "Total hours" and "Hours at last service" are
**read-only**, shown with the next service due, and come with two actions: "Log hours" and
"Record a service". Both lead to the maintenance log. The fields stay editable only when
**registering** a boat, as opening values. Hours are an append-only meter log (ADR-002 lets
staff log hours and keeps lowering a counter to `complete_maintenance`), so a form that looks
editable but silently ignores the input is a defect. No external research was needed: this
follows the platform's own maintenance design.

**What to build.**
- **Build now (frontend):** in edit mode, render the two values as text with `aria-describedby`
  help ("Hours change through the maintenance log"), plus the two links. Remove both keys from the
  edit payload. In create mode keep the inputs, with client validation `last <= total`.
- **Build now (DB, small):** confirm that the create path (boat insert or RPC) refuses
  `last_maintenance_hours > accumulated_hours` with a readable message, if no CHECK does so
  already.

### 8. Admin-scheduled account deletion

**What others do.** Airbnb separates platform-initiated removal from user choice. The account is
"pending removal" with a notice and an **appeal link and deadline** (the example shows 48 hours).
The user cannot simply undo it. Reinstatement happens only through the appeal, and an approved
appeal does not restore cancelled reservations (R1, R2). A user's own deletion request remains
cancellable during its grace period (the platform's existing 30-day model).

**Decision.** An admin-scheduled deletion carries a **source**:
- `admin_on_request`: the admin acts on the user's own written request (for example by e-mail).
  The user can cancel it, as today.
- `admin_housekeeping`: stale or duplicate accounts (section 13). The user can cancel it
  ("I still need this account").
- `admin_enforcement`: fraud, false documents, safety, breach of terms. **Locked**: the user
  cannot cancel it from the Account page, which explains the appeal route instead (e-mail
  support within 14 days). Only a super administrator can lift it, which is the appeal outcome.

Self-requested deletions keep `self`. The 30-day window stays for every source, because it is
also the appeal window and lets upcoming bookings finish. Cutting access at once is a separate,
explicit admin step (revoke verification, suspend listings), for the same reasons migration 38
kept demotion separate from deletion.

**What to build.**
- **Build now (DB):** `profiles.deletion_source text check (deletion_source in ('self',
  'admin_on_request','admin_housekeeping','admin_enforcement'))`, `profiles.deletion_reason text`
  and `profiles.deletion_scheduled_by uuid`. Extend the existing pair check: all null or
  `deletion_source` not null. Neither column gets a client SELECT grant; the reason is
  admin-only, exposed through `admin_list_users`, and the user sees only "closed by Kariba Lake
  Connect" via `account_deletion_status()`. Backfill pending rows: `self` when requested by the
  user, otherwise `admin_on_request`.
- **Build now (DB):** `admin_schedule_account_deletion(p_user_id, p_source, p_reason)`: `p_source`
  required (not `self`); `p_reason` required, at least 10 characters for `admin_enforcement`.
  `cancel_account_deletion()` refuses when `deletion_source = 'admin_enforcement'`, with the
  appeal message. `admin_cancel_account_deletion` stays super-admin only and works for every
  source.
- **Build now (frontend):** a source picker and reason box in the admin Roles view; a locked
  state on the Account page with the appeal text.
- **Build later:** a real suspension flag (`profiles.suspended_at`) checked by RLS and RPCs, and
  a minimal block list (hashed e-mail and phone) kept after an enforcement purge to stop instant
  re-registration, justified under the CDPA as legitimate interest in fraud prevention.
  *Trigger:* the first fraud case, or before opening signups widely.
- **Policy text only:** `terms.md` "Suspension and closing accounts": a closure for breach cannot
  be cancelled from the Account page; how and when to appeal. `privacy.md`: that a closure reason
  is recorded.

### 9. Photo uploader attribution

**Decision.** The standard is that **the server stamps audit fields and never trusts them from
the client** (OWASP mass assignment: bind only allow-listed fields and set privilege or
attribution fields server-side; O1). `uploaded_by` is set from `auth.uid()`.

**What to build.**
- **Build now (DB):** a `BEFORE INSERT` trigger on `boat_images`: `new.uploaded_by :=
  coalesce(auth.uid(), new.uploaded_by)` (service-role jobs keep their value). Revoke the
  `uploaded_by` column from the client INSERT grant (`grant insert (boat_id, storage_path,
  sort_order, is_primary)`). No UPDATE of that column for clients. Check that `moderation_status`
  is not client-insertable either.
- **Build now (frontend):** `uploadBoatImages` stops sending `uploaded_by`.
- **Policy text only:** a note in the migration conventions: every `*_by` and `*_at` audit column
  is server-stamped.

### 10. Team invitations

**What others do.** GitHub organisation invitations **expire after 7 days**, can be retried or
cancelled, and can be accepted only by an account whose **verified** e-mail matches the invited
address (G1). Booking.com's extranet adds an existing user directly and e-mails people without an
account an invitation to register (P3). Supabase's `inviteUserByEmail` needs the service-role
key on a server. Its link expiry is the project-wide e-mail OTP setting (24 hours by default),
shared with password resets, so it is not a good invitation lifetime (S1, S2).

**Decision.** Build invitations **later**, with this design ready. Today an owner adds an
existing operator account, which works for the live team of one. Invitations need a new signup
branch, so they are not worth it until a second person actually needs to join a team. Design:
the platform's own invitation token (not Supabase's invite link), shared by the owner as a link
(copy or WhatsApp), no e-mail channel needed; 7-day expiry; single use; revocable; acceptance
**only on first sign-in after e-mail confirmation**, by the account whose confirmed e-mail equals
the invited address. That closes the takeover risk ADR-002 named.

**What to build.**
- **Build later (DB):** `company_invitations (id, company_id, email citext, member_role, token_hash
  bytea, invited_by, created_at, expires_at default now() + interval '7 days', accepted_at,
  accepted_by, revoked_at)` with a unique pending index on `(company_id, lower(email))` where
  `accepted_at is null and revoked_at is null`. RPCs: `create_company_invitation(company, email,
  role)` (`manage_members`, returns the raw token once, at most 20 per company per day);
  `revoke_company_invitation(id)`; `invitation_preview(token)` (company name and role only);
  `accept_company_invitation(token)` (confirmed `auth.email()` match, operator account, empty
  workspace dissolved as in `add_company_member`).
- **Build later (frontend):** `/invite/:token` page leading to operator signup with the e-mail
  prefilled and locked; a "Pending invitations" list in TeamSection.
- **Build later:** the same pattern for hotels and agencies (`partner_invitations`), so a verified
  partner manager can add desk staff without an admin linking each one. *Trigger for both:* the
  first team or partner that asks for a second user.

### 11. Company back to individual

**Decision.** It stays **admin-only and is built later**. One live company, no request so far.
Rules when built: only when the workspace has exactly one member, who is an owner, and no pending
invitations; `operator_type := 'individual'`; the registered name is kept as the trading name;
the `company_registration` document is kept (not deleted) but is no longer required;
verification is re-evaluated with `revalidate_company_verification` (it normally stays verified,
because an individual needs a subset of the company's proofs); audit with a required reason.

**What to build.**
- **Build later (DB):** `admin_convert_to_individual(p_company_id, p_reason)`.
- **Build later (frontend):** an admin action on the company page.
- **Policy text only (now):** the admin runbook entry "Company to individual: ask the owner to
  confirm in writing; until the tool exists, leave the company as it is."
  *Trigger:* the first request.

### 12. Fee schedule and commission model

**What others do.**
- *MSC.* Commission is a percentage of the cruise fare, which varies by season and product (10%
  to 14% in the UK from 2013) plus overrides; lower rates on extras (5% on on-board services and
  7% on pre- and post-cruise services in South Africa); warnings against discounting (M8, M9).
  Explora (MSC's luxury line) pays commission when deposits and final payments are received
  (M10).
- *Royal Caribbean and Carnival.* Volume tiers on sailed business (Carnival 10% base and 11 to
  15% tiers by sailed cabins), and non-commissionable fares that lower the effective rate by 20
  to 25% (C2, C4, C5).
- *Viator.* Net-rate model: the supplier sets a net rate, Viator sets the retail price, pays the
  supplier monthly, and pays travel agents' commission itself (V2). Agents are paid monthly for
  travel in the previous month (V3).
- *Booking.com.* Monthly invoice of commission on stays checked out in the previous month (P1).
  *GetYourGuide.* Commission only on successful bookings (secondary source).
  *Click&Boat.* The owner pays commission of roughly 15 to 25% (B3).
- *Expedia TAAP.* Agency commission paid monthly after the stay, through the agency account (P2).

**Decision.**
1. **Gross model with no mark-up.** The guest pays the operator's published price (terms: no
   booking fee). The operator owes the platform an **operator commission** on each completed
   booking, a percentage of `price_total`. The platform pays a **partner commission** on
   completed partner bookings **out of its own commission**, as Viator does. Operators pay the
   same rate whoever booked, so they have no reason to refuse partner bookings, and partners'
   rates stay confidential from operators.
   **Owner decision:** the default operator rate (proposed 10%). It is lower than Click&Boat or
   Viator because the platform does not collect payment and carries collection risk, and a high
   rate drives operators off-platform. Partner rate default stays 8%, which leaves 2% on partner
   bookings at the proposed default. A per-operator rate allows 12 to 15% for operators who
   want more partner distribution.
2. **Per-party rates with dated changes.** One rate per operator company, hotel and agency.
   Changes are dated rows. A change that is worse for the party (higher for an operator, lower
   for a partner) must take effect at least 30 days after it is recorded, which enforces the
   terms' notice rule in the database. A better change may apply at once.
3. **Snapshot at confirmation.** The rates in force on the confirmation date are copied to the
   booking, so "a new rate never applies to a confirmed booking" (terms) holds by construction.
4. **Earned at completion, statements monthly.** Statements cover bookings completed in a
   calendar month (Africa/Harare), as Booking.com's check-out month does. Operator statements are
   due 15 days after issue. Partner commission for a booking becomes payable once the operator's
   statement covering it is paid ("pay when collected"), within 30 days. This is honest about the
   off-platform model: the platform has no money to pay partners until operators pay it.
5. **Tax.** A statement is not a tax invoice. If the platform is VAT-registered, ZIMRA requires
   fiscalised tax invoices, which are issued from the platform's fiscalised accounting system
   with the statement attached. Whether the ZTA's 2% tourism levy applies to commission income
   is a question for the platform's tax adviser (Z6). Currency: USD, the currency of boat prices.
6. **No volume tiers or overrides yet.** Tiers need volume. The dated-rate table can express a
   negotiated override for one partner today.

**What to build.**
- **Build now (DB):** `commission_rates (id uuid pk, party_type text check (party_type in
  ('operator','hotel','agency')), company_id uuid, hotel_id uuid, agency_id uuid, rate
  numeric(5,2) not null check (rate between 0 and 30), effective_from date not null, note text,
  created_by uuid, created_at timestamptz default now())`, with a check that exactly the matching
  id is set and a unique index on `(party_type, coalesce(company_id, hotel_id, agency_id),
  effective_from)`. `commission_rate_on(party_type, party_id, on_date) returns numeric` takes the
  latest row with `effective_from <= on_date`, falling back to the party's default.
  `admin_set_commission_rate(party_type, party_id, rate, effective_from, note)` enforces the
  30-day rule. `companies.commission_rate` (new, default 10 pending the owner decision) and the
  existing `hotels` / `agencies.commission_rate` become the **current rate mirrors**, written
  only by that RPC and a nightly roll-forward, so existing reads keep working. Backfill one row
  per existing party, effective from its `created_at` date.
- **Build now (DB):** booking columns `operator_commission_rate numeric(5,2)`,
  `partner_commission_rate numeric(5,2)`, `commission_locked_at timestamptz` and
  `completed_at timestamptz`, stamped in `owner_set_booking_status` on `confirmed` (rates) and
  `completed` (time). There is no backfill for already-completed bookings; their statements use
  the current rate and say so. *Why now:* snapshots cannot be recreated afterwards.
- **Build now (DB, later batch):** `commission_statements (id, period_month date, party_type,
  company_id, hotel_id, agency_id, currency char(3) default 'USD', total_amount numeric(12,2),
  status text check (status in ('draft','issued','paid','void')), issued_at, due_at, paid_at,
  paid_reference text, created_by, created_at)` and `commission_statement_lines (id,
  statement_id, booking_id, booking_reference, trip_date, price_total, rate, amount, line_type
  check (line_type in ('commission','adjustment')), note)`, with a unique index on
  `(booking_id, party_type)` for `commission` lines, so a booking is billed once per side.
  Admin RPCs: `admin_build_statements(p_month)` (drafts for bookings `completed` with
  `completed_at` in the month and not yet on a statement), `admin_add_adjustment`,
  `admin_issue_statement`, `admin_mark_statement_paid(p_id, p_reference)` and `admin_void_statement`.
  Issued lines are immutable (trigger); corrections are adjustment lines on the next statement.
  RLS: operators read their company's statements with `view_finances`; partner staff read their
  organisation's; admins read all.
- **Build now (frontend, later batch):** an admin "Commission" page (build, review, issue, mark
  paid, CSV export); owner and partner statement lists with print and CSV; "awaiting operator
  payment" on partner lines whose operator line is unpaid.
- **Build later:** automatic statement generation by pg_cron on the 3rd of each month; volume
  tiers; e-mailing statements. *Trigger:* more than about 20 statements a month, or a
  notification channel.
- **Policy text only:** the partner fee schedule (rates, cycle, due dates, pay-when-collected,
  disputes within 30 days of issue); `terms.md` "Commission and fees" names the snapshot and
  statement rules; the operator agreement adds the statement due date and suspension for unpaid
  statements after a reminder.

### 13. Duplicate and stale accounts

**What others do.** No single standard exists. Common practice: a reminder about 24 hours after
signup, auto-deleting unconfirmed accounts after 7 to 14 days, notifying an admin before
deletion, and never deleting an account that has orders or recent activity (H1, H2, H3).
GitHub's 7-day invitation expiry is the same idea for invitations (G1). The CDPA's purpose
limitation (privacy policy: "only as long as we need it") points the same way.

**Decision.**
- **Pending partner or operator accounts with no documents:** an in-app reminder from day 7; at
  day 30 they appear in an admin **Stale** filter; the admin then schedules deletion with source
  `admin_housekeeping` (user-cancellable, 30-day window). Never stale: accounts with any booking,
  any document, a workspace with boats, or a sign-in in the last 30 days.
- **Accounts that never confirmed their e-mail:** deleted automatically after 14 days, when
  nothing references them.
- **Duplicates:** the admin merges by hand. The Stale view flags accounts that share a phone
  number (last 9 digits) or an organisation name with another account.
- **The leftover pending agency account now:** the admin schedules it for deletion with
  `admin_housekeeping` once section 8 ships, or with today's tool (it is cancellable either way).

**What to build.**
- **Build now (DB):** `admin_list_stale_accounts(p_days int default 30)` (admin only) returns
  role, created_at, last_sign_in_at (from `auth.users`), document count, booking count, boat
  count and a `possible_duplicate_of` id where phone or organisation name matches.
- **Build now (frontend):** a "Stale" filter in the admin Users view, with a bulk "Schedule
  deletion (housekeeping)"; a pending-account banner: "Upload your documents. Accounts with no
  documents after 60 days may be closed."
- **Build later (DB):** a nightly pg_cron job deleting unconfirmed auth users older than 14 days
  with no references beyond their own profile and consent rows (verify the foreign keys from
  migration 33 first); and automatic `admin_housekeeping` scheduling at day 60, with
  `deletion_scheduled_by` null and source `admin_housekeeping`. *Trigger:* more than about 10
  stale accounts a month, or after a month of using the manual filter.
- **Policy text only:** `privacy.md` "How long we keep it": unconfirmed signups are deleted after
  14 days; partner and operator accounts left unverified with no documents may be closed after
  60 days, with notice in the portal.

---

## Alternatives Considered

| # | Option | Pros | Cons |
|---|--------|------|------|
| 1 | Partners may cancel only `requested`; confirmed bookings via the guest or operator | Fewer disputes about who cancelled | The hotel is often the only contact the operator has; MSC and every trade channel let the agent cancel for the passenger |
| 1 | Operator-defined free-text cancellation terms (today's terms) | Maximum flexibility | Not computable, not comparable, cannot be quoted or enforced; guests see them late |
| 1 | **Three presets, snapshotted, capped at the deposit, with legal overrides (chosen)** | Quotable before cancel; same rules for guest and partner; works off-platform | Some operators want custom tiers (Build later) |
| 1 | Tiers as % of the trip total (MSC style) | Matches cruise practice | The operator holds only the deposit; a fee above it cannot be collected, so the display would be dishonest |
| 2 | Keep "at least one document uploaded" | No work | An unreviewed file verifies a partner who sees guest phones and earns commission |
| 2 | Require IATA for agencies | Strong global signal | Excludes most legitimate tour and lodge agents; IATA governs air ticketing |
| 2 | **Typed, approved, unexpired documents per partner type, ZTA first (chosen)** | Same rule as operators; follows Zimbabwean law | More admin review; a 60-day grandfathering period |
| 2 | Add partner kinds to `company_document_kind` | One enum | Silently tightens every operator through `required_proof_kinds` |
| 3 | Let agencies accept the operator agreement too | No new document | Wrong content: it binds them to operator duties and omits commission, data and brand terms |
| 3 | **Separate partner agreement for hotels and agencies (chosen)** | Right duties for the right party | One more consent; existing partners re-consent at next sign-in |
| 4 | Staff acceptance only (today) | Simple | The waiver binds the staff member, not the guest; weak protection for the operator |
| 4 | Block the booking until the guest accepts | Strongest record | Fails with poor connectivity and walk-in hotel bookings |
| 4 | **Partner attests, guest accepts on `/track`, paper fallback on board (chosen)** | Uses existing reference and phone auth; no new token or e-mail | Anyone holding the reference and phone can accept; same trust model as tracking |
| 4 | Per-adult acceptance (cruise check-in) | Each adult bound personally | Heavy for short trips; not the Kariba houseboat norm |
| 5 | Keep commission hidden from partners | No work | Every trade portal shows it; hidden rates cause disputes and mistrust |
| 5 | **Rate, per-booking status and statements, never on guest surfaces (chosen)** | Matches MSC Book, TAAP and Viator | Needs the ledger in section 12 |
| 6 | Hide the captain from all partners | Less personal data shared | Contradicts the privacy policy's guest promise; hotels coordinate pick-ups |
| 6 | **Show to whoever holds the booking, until the end of the trip day (chosen)** | One rule; matches operator practice | The captain's phone reaches the hotel desk; time-limited |
| 7 | Make hours editable on existing boats | Quick fixes | Lowers a maintenance counter outside `complete_maintenance`; bypasses the audit trail |
| 7 | **Read-only with links to the maintenance log (chosen)** | Honest UI; one write path | One extra click to correct hours |
| 8 | Keep every admin deletion user-cancellable | Simple | A fraudster cancels their own closure |
| 8 | Delete at once on enforcement | Fast | No appeal; breaks upcoming guests' bookings; conflicts with the CDPA's right to a human review |
| 8 | **Source-tagged deletions, locked for enforcement, with appeal (chosen)** | Matches Airbnb's removal and appeal model | Access is cut by a separate step until suspension exists |
| 9 | Policy check `uploaded_by = auth.uid()` | Refuses forgeries | Still trusts the client to send it; the trigger is simpler and cannot be wrong |
| 9 | **Server-stamped by trigger, column grant revoked (chosen)** | Standard practice | None |
| 10 | Build invitations now | Smooth onboarding | Signup branch, token handling and UI for a team of one |
| 10 | Supabase `inviteUserByEmail` | Ready-made e-mail | Needs a service-role server; expiry tied to password resets |
| 10 | **Own token, 7 days, confirmed e-mail match, build later (chosen)** | Safe and channel-free | Owners keep the sign-up-first step until it is built |
| 11 | Self-service downgrade | No admin | Changes what tourists see and the proof set without review |
| 11 | **Admin RPC, built later (chosen)** | Rare event, reviewed | Manual until then |
| 12 | Operator pays partner commission on top | Platform keeps its full rate | Operators would avoid partner bookings; rates leak to operators |
| 12 | Net-rate model with platform mark-up | Platform margin regardless | Contradicts "guests pay no booking fee"; needs payment collection |
| 12 | **Gross; platform pays partners from its commission; dated rates; snapshot at confirmation; monthly statements (chosen)** | Matches Viator; enforces the 30-day notice rule; honest pay-when-collected | Thin margin on partner bookings at default rates (Owner decision) |
| 13 | Auto-delete stale pending accounts now | No admin work | Risky before the rules have been tested on real data |
| 13 | **Manual Stale filter now, automation later (chosen)** | Safe, quick | Needs admin attention monthly |

## Consequences

**Positive:**
- Guests, partners and operators see the same cancellation fee **before** cancelling, and the
  booking records who cancelled, why, what is owed and whether it was refunded.
- Partners are verified on what Zimbabwean law actually requires (ZTA), with the same lifecycle
  as operators, and they sign terms written for them.
- A partner booking carries the guest's own waiver acceptance, or a recorded paper signature.
- Commission becomes auditable: dated rates, snapshots, immutable statement lines, and the
  30-day notice rule enforced by the database.
- Hygiene gaps close: forged uploader attribution, a fraudster cancelling their own closure,
  hours fields that ignore input, and stale accounts piling up.

**Negative:**
- `cancel_booking`'s signature changes (the old function is dropped); every caller must pass the
  new arguments, so deploy the frontend after the migration.
- Existing partners must upload typed documents within 60 days and accept the partner agreement.
- Admins gain review work: partner documents, refund disputes and monthly statements.
- A partner booking needs one more step from the guest; some guests will only sign on board.

**Risks:**
- **Off-platform refunds remain unenforceable** except by suspension. A determined operator can
  ignore a refund. Mitigation: the dispute queue, suspension, and the trust score.
- **Commission leakage:** operators and partners can move repeat guests off-platform. Mitigation:
  a moderate operator rate, the acceptable-use clause in the terms, and value from tracking,
  waivers and statements.
- **Legal uncertainty:** the CPA cooling-off on near-term trips, VAT and fiscalisation on
  commission, and whether the 2% tourism levy applies to commission. Each is flagged for review.
- **ZTA data quality:** certificates cannot be checked automatically. Admins verify by eye until
  ZTA publishes a register.
- **Reference and phone trust model** now also unlocks waiver acceptance and the captain's phone.
  Rate-limit `/rest/v1/rpc/track_booking` and `guest_accept_waiver` at the gateway if abuse
  appears (migration 31's note).

## Implementation batches

Migration numbers continue from 41. Each batch is one migration (with its frontend); deploy the
frontend after the migration. Reviews follow the conventions of migrations 36 to 41 (live
`pg_get_functiondef` before replacing, grants restated, audit triggers).

1. **42: cancellations and refunds** (section 1). DB, then frontend.
2. **43: commission snapshot and visibility** (section 12 rates and snapshot; section 5 terms
   RPCs). Then **44: statements** (section 12 statements; section 5 statement views).
3. **45: partner verification and partner agreement** (sections 2 and 3).
4. **46: guest waiver confirmation and captain rule** (sections 4 and 6, both extend
   `track_booking`).
5. **47: account hygiene** (sections 8, 9 and 13), plus the frontend-only section 7.
6. Policy text pass across `terms.md`, `privacy.md`, the operator agreement, the partner
   agreement and the fee schedule, for legal review (all sections).

## References

[fetched] means the page was read with WebFetch. [search extract] means only search-engine
extracts were available (the page blocked fetching or was not tried). MSC pages all returned
HTTP 401 to WebFetch.

**MSC Cruises**
- M1. MSC Cruises UK, Booking Terms and Conditions: https://www.msccruises.co.uk/terms-conditions [search extract; 401]
- M2. MSC Cruises UK, Standard Booking Terms 2023-24 (PDF): https://www.msccruises.co.uk/-/media/uk/documents/standard-booking-terms-and-conditions-uk-2023-24.pdf [search extract]
- M3. MSC Cruises AU/NZ Terms and Conditions, 15 May 2025 (PDF): https://www.msccruises.com.au/-/media/australia/documents/msc-cruises-au-nz-term-conditions-15-may-2025.pdf [search extract; 401]
- M4. MSC Cruises Ireland, General Terms and Conditions, April 2023 (PDF): https://msccruises.ie/content/dam/msc-cruises/b2c-assets/b2c-countries/ie/visas-and-travel-docs/irl-new-general-msc-cruises-terms-and-conditions-april-2023.pdf [search extract; 401]
- M5. MSC Booking Terms 2027-28, Saudi Arabia, Qatar and Lebanon (PDFs): https://www.msccruises.com/int/-/media/international/emerging-markets/termsconditionspdf/2027-28/btc-sau.pdf , .../btc-qat.pdf , .../btc-lbn.pdf [search extract; 401]
- M6. MSC Cruises Israel: https://msccruises.co.il/en/?p=3648 [search extract]
- M7. MSC Book reporting and "View Commission": TravelAge West, https://www.travelagewest.com/Travel/Cruise/MSC-Book-Comes-to-America ; TravelPulse, https://www.travelpulse.com/news/technology/msc-unveils-msc-book-travel-agent-booking-system ; Seatrade Cruise, https://www.seatrade-cruise.com/information-technology/msc-book-goes-live-stateside-with-bonus-agent-pay [search extract; 2014 to 2015 launch coverage]
- M8. MSC 2013 commission levels (10 to 14%): https://travelweekly.co.uk/articles/42725/msc-cruises-revises-2013-commission-levels ; MSC South Africa pre/post and on-board commission: https://www.travelnews.co.za/article/local-is-lekker-with-msc [search extract; undated]
- M9. MSC warning to agents who discount: https://travelweekly.co.uk/articles/42739/msc-issues-warning-to-agents-who-discount [search extract]
- M10. Explora Journeys commission on receipt of funds: https://aspiretravelclub.co.uk/news/mscs-new-luxury-line-unveils-rolling-agent-commission-structure [search extract]
- MSC cancellation tables as mirrored by Expedia: https://www.expedia.com/lp/b/cancelation-policy-msc-cruises [search extract]
- msccruises.co.za: not found in any search; no South African terms were available.

**Cruise lines (comparison)**
- C1. Royal Caribbean online check-in FAQ: https://www.royalcaribbean.com/aus/en/faq/topics/online-check-in-boarding ; per-adult ticket contract acceptance (third-party guide): https://specialforcesassociation.org/wp-content/uploads/2024/10/Detailed-online-checkin-procedures.pdf [search extract]
- C2. Carnival base commission tiers: https://www.carnivalcorp.com/news-releases/news-release-details/carnival-accelerates-earnings-opportunities-travel-agents-new ; https://www.seatrade-cruise.com/marketing/carnival-reduces-sales-thresholds-for-agents-to-earn-higher-pay [search extract]
- C3. Carnival deposit and cancellation policy: https://www.carnival.com/popups/bookingengine/deposit-and-final-payment-cancellation-policy [search extract]
- C4. ASTA brief on non-commissionable fares: https://asta.org/common/uploaded%20files/asta/industryaffairs/resources/ncfindustrybrief.pdf [search extract]
- C5. Royal Caribbean volume tiers (secondary, unverified): https://dmcquote.com/blog/post/cruise-commission-structures-how-travel-agents-earn [search extract]

**Activity and travel platforms**
- V1. Viator, Cancellation policies and processes: https://partnerresources.viator.com/travel-commerce/merchant/cancellation-policies/ [fetched]
- V2. Viator Supplier Agreement (SEC exhibit 10.26): https://www.sec.gov/Archives/edgar/data/1933762/000182912623007166/amphitritedigital_ex10-26.htm [fetched]; 2026 update: https://operatorresources.viator.com/updated-supplier-agreement-august-2026/ [search extract]
- V3. Viator Travel Agent Center, Commission and payments: https://agentcenter.viator.com/resources/commission-and-payments/ [fetched]
- P1. Booking.com partner FAQ (monthly invoice, cancellations, no-shows): https://join.booking.com/faq.html ; Guesty summary: https://www.guesty.com/blog/how-much-does-booking-com-charge-hosts [search extract]
- P2. Expedia TAAP Academy FAQ: https://taapacademy.expediagroup.com/faq [fetched]
- P3. Booking.com extranet account types and users: https://partnerhelp.booking.com/hc/en-gb/articles/213301525-How-do-I-log-on-to-my-Extranet- [search extract]
- GetYourGuide supplier terms: not found. Commission "only on successful bookings" comes from a Bokun blog summary (secondary).

**Boat-charter marketplaces**
- B1. Click&Boat, Choose my cancellation policy (owner): https://help.clickandboat.com/hc/en-gb/articles/4416567287058-Choose-my-cancellation-policy-Owner [search extract]
- B2. Click&Boat, Owner's cancellation and tenant's refund: https://help.clickandboat.com/hc/en-gb/articles/4416566171794-Owner-s-cancellation-and-tenant-s-refund [search extract]
- B3. Click&Boat, Commission versus booking fees: https://help.clickandboat.com/hc/en-gb/articles/4416568609938 [search extract]
- B4. SamBoat, Conditions for cancelling a rental: https://www.samboat.co.uk/help/what-are-the-conditions-for-cancelling-a-rental-41 [search extract]
- B5. Boatsetter, Cancellation policy: https://support.boatsetter.com/en_us/cancellation-policy-ryTZ81jno.md [search extract]
- B6. Boatsetter, How to find captains (renters): https://support.boatsetter.com/en_us/how-to-find-captains-renters-S1kGUyj2s.md [search extract]

**Southern African operators and lodges**
- K1. Houseboats on Kariba, Terms and Conditions: http://www.houseboatsonkariba.com/terms-conditions/ [fetched]
- K2. MV Matusadona, Rates and terms: https://mv-matusadona.com/rates/ [fetched]
- K3. Kariba Houseboats listings with cancellation and agent terms: https://karibahouseboats.com/?cruise=philippa ; Kariba Houseboat Safaris booking: https://karibahouseboatsafaris.com/kariba-houseboat-booking/ [search extract; some pages more than a year old]
- L2. Onguma (Namibia), rates and STO-rate rule: https://onguma.com/rates/ [search extract]
- W3. Wilderness camps' deposit and cancellation (via Virtuoso): https://www.virtuoso.com/promotions/16790437/wilderness-honeymoon-special ; Wilderness Travel agent guidelines (IATAN or CLIA requirement): https://www.wildernesstravel.com/wp-content/uploads/2026/02/travel-agent-guidelines-letterhead.pdf [search extract]
- Rhino Safari Camp terms and agent rates: not found.

**Zimbabwe and South Africa regulation and trade bodies**
- Z1. ZTA e-registration requirements: https://app.zimbabwetourism.net/requirements [fetched]
- Z2. Pindula News, ZTA 28 February 2026 registration deadline: https://news.pindula.co.zw/2026/02/19/tourism-operators-given-28-february-deadline-to-register-with-zta/ [fetched]
- Z3. Tourism Act [Chapter 14:20]: https://www.law.co.zw/download/1892/ ; SI 107 of 1996, Tourism (Designated Tourist Facilities) Regulations: https://faolex.fao.org/docs/pdf/zim203563.pdf [search extract]
- Z4. Tourism Bill H.B. 7, 2025 (Veritas): https://www.veritaszim.net/sites/veritas_d/files/Tourism%20Bill%20H.B.%207,%202025.pdf [search extract; enactment not confirmed]
- Z5. Tourism Update, ZTA shuts down unregistered operators: https://www.tourismupdate.com/article/update-zta-begins-shutting-down-unregistered-zim-tour-operators [search extract]
- Z6. Herald, ZTA tightens industry ties (2% levy context): https://www.heraldonline.co.zw/zta-tightens-industry-ties-regularises-sector-for-growth/ [search extract]
- Inland Waters Shipping Act [Chapter 13:06]: https://zimlii.org/akn/zw/act/1971/34/eng@2016-12-31 [search extract]
- A1. ASATA, Join ASATA: https://asata.co.za/join-asata/ [search extract]
- A2. ASATA, Is it compulsory to join ASATA?: https://asata.co.za/faq/is-it-compulsory-for-travel-agents-in-south-africa-to-join-asata/ [search extract]
- A3. ASATA Travel Members Terms of Reference (Feb 2020): https://asata.co.za/wp-content/uploads/2020/02/2020-02-Travel-Members-Terms-of-Reference.pdf [search extract]
- TBCSA trade verification standard: not found. Zimbabwe travel agent association: name and rules unverified.

**Accounts, invitations and security**
- R1. Airbnb, account removal and appeals: https://www.airbnb.com/help/article/3835 [search extract]
- R2. Airbnb, listing and account removal: https://www.airbnb.com/help/article/1303 [search extract]
- G1. GitHub Docs, Inviting users to join your organization: https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization [search extract]
- S1. Supabase, `auth.admin.inviteUserByEmail`: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail [search extract]
- S2. Supabase discussion, OTP expiry versus invite expiry: https://github.com/orgs/supabase/discussions/23444 [search extract]
- H1. Indie Hackers, What do you do with unverified users: https://www.indiehackers.com/post/what-do-you-do-with-unverified-users-e46f6cbe66 [search extract]
- H2. Knock, E-mail verification workflow template: https://knock.app/template-library/workflows/email-verification [search extract]
- H3. Zorem, Customer e-mail verification maintenance: https://docs.zorem.com/docs/customer-email-verification-pro/maintenance/ [search extract]
- W1. TripWorks, How customers sign waivers: https://www.tripworks.com/university/how-customers-sign-waivers [search extract; vendor source]
- O1. OWASP Mass Assignment Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html [search extract]

**Internal**
- ADR-001 (guest booking edits), ADR-002 (operator accounts).
- Migrations 05, 18, 23, 27, 28 to 28e, 31, 33, 35, 37, 38, 40 and 41; `src/content/legal/terms.md`
  and `privacy.md`; `src/components/partner/PartnerBookingList.tsx`;
  `src/components/owner/BoatForm.tsx`; `src/pages/Signup.tsx`; `src/services/partners.service.ts`.
