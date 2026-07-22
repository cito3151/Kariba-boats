# Terms and Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture explicit, versioned, provable consent to platform legal documents at signup, at booking, and on re-consent when a required document changes, enforced server-side.

**Architecture:** Two Supabase migrations add versioned `legal_documents` and an append-only `consent_records` ledger plus SECURITY DEFINER RPCs (record/read consent, publish documents, and a new `create_booking` that bundles the waiver). Existing gated RPCs get a consent guard. A thin `legal.service.ts` fronts the RPCs; React surfaces (signup checkboxes, a re-consent gate, the booking waiver, and a super-admin document editor) consume it. Acceptances flow into the subsystem-3 audit log automatically.

**Tech Stack:** Supabase (Postgres 17, RLS, SECURITY DEFINER, triggers), @supabase/supabase-js v2, React 19 + TypeScript, Vite, Tailwind v4, react-router-dom v7, framer-motion, lucide-react.

## Global Constraints

- Supabase project ref is `sbrsptgpnjljnongklus`. NEVER target `ckkpucbphqendxtrnqcz` (AgriSense).
- Commit as `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo` (Vercel Hobby rejects other authors). Use PowerShell for commits (bash git hangs on index.lock).
- No em dashes anywhere (UI copy or code comments). Use commas, colons, or "to".
- Migrations are version-controlled: the `.sql` file in `supabase/migrations/` MUST be byte-identical to what is applied via the Supabase MCP `apply_migration`. Save the file, then apply the same text.
- All new SQL functions are `SECURITY DEFINER` with `set search_path = public, pg_temp` and self-guard authorization internally.
- Errors reaching the client go through `humanizeError` (`src/services/errors.ts`) so raw Postgres/RLS text never shows.
- Branch for this work: `feat/terms-consent` (already created; the design spec is committed there).
- cyton.kwanisi@agri-forge.net is the sole super-admin. NEVER delete or demote it.
- This project has no unit-test runner. "Tests" are SQL probes via MCP `execute_sql`, authenticated REST/RPC calls via curl, `npx tsc --noEmit`, `npm run build`, `npm run lint`, the security advisor, and in-browser checks, matching subsystems 1 to 3.

Reference values used throughout:
- Supabase URL: `https://sbrsptgpnjljnongklus.supabase.co`
- Publishable (anon) key: `sb_publishable_N-POTGTvRCFjkz9M5tS4gQ_pAHtY5_W`
- A bash helper to get a user token:
  ```bash
  REF="sbrsptgpnjljnongklus"; KEY="sb_publishable_N-POTGTvRCFjkz9M5tS4gQ_pAHtY5_W"
  tok(){ curl -s -X POST "https://$REF.supabase.co/auth/v1/token?grant_type=password" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"//'; }
  ```

---

## Task 1: Migration 18 — consent data model and document management

Creates the tables, enums, RLS, seeds version 1 of all five documents, and the read/record/publish functions. No enforcement yet (Task 2), so this task is independently testable: documents exist, a signed-in user can record and read outstanding consents.

**Files:**
- Create: `supabase/migrations/18_add_terms_and_consent.sql`
- Apply: via MCP `apply_migration` (name `add_terms_and_consent`, identical text)

**Interfaces:**
- Produces (SQL, relied on by later tasks):
  - Tables `public.legal_documents`, `public.consent_records`.
  - Enums `public.legal_doc_type` (`terms`,`privacy`,`operator_agreement`,`booking_waiver`,`marketing`), `public.consent_context` (`signup`,`re_consent`,`booking`).
  - `record_consent(p_doc_type legal_doc_type, p_version int, p_context consent_context, p_booking_id uuid default null, p_accepted boolean default true) returns consent_records`
  - `outstanding_consents(p_user uuid default auth.uid()) returns table(doc_type legal_doc_type, version int, title text, body text)`
  - `has_outstanding_required_consent(p_user uuid default auth.uid()) returns boolean`
  - `publish_legal_document(p_doc_type legal_doc_type, p_title text, p_body text, p_is_required boolean, p_applies_to_roles text[] default null) returns legal_documents`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/18_add_terms_and_consent.sql` with exactly:

```sql
-- Subsystem 4: terms, consent, and legal agreements.
-- Versioned, DB-managed legal documents plus an append-only consent ledger.
-- Documents are edited/published by super-admins; acceptances are recorded only
-- through record_consent (SECURITY DEFINER), so consent_records cannot be forged
-- or edited through the API. Enforcement guards live in migration 19.

create type public.legal_doc_type as enum
  ('terms','privacy','operator_agreement','booking_waiver','marketing');
create type public.consent_context as enum ('signup','re_consent','booking');

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type public.legal_doc_type not null,
  version int not null,
  title text not null,
  body text not null,
  is_required boolean not null default false,
  applies_to_roles text[],
  is_current boolean not null default true,
  effective_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  published_by uuid,
  unique (doc_type, version)
);
create unique index legal_documents_one_current
  on public.legal_documents (doc_type) where is_current;

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid not null references public.legal_documents(id),
  doc_type public.legal_doc_type not null,
  version int not null,
  context public.consent_context not null,
  booking_id uuid,
  accepted boolean not null default true,
  accepted_at timestamptz not null default now()
);
create index consent_records_user_idx on public.consent_records (user_id, doc_type);
create index consent_records_booking_idx on public.consent_records (booking_id);

-- RLS: legal_documents. Everyone (incl anon) reads the current version; admins
-- read all versions. No client write policy: writes go through publish RPC only.
alter table public.legal_documents enable row level security;
create policy "legal_documents_read_current" on public.legal_documents
  for select to anon, authenticated using (is_current);
create policy "legal_documents_read_all_admin" on public.legal_documents
  for select to authenticated using (public.is_admin());
revoke all on public.legal_documents from anon, authenticated;
grant select on public.legal_documents to anon, authenticated;

-- RLS: consent_records. Owner reads own; admins read all. No client write policy.
alter table public.consent_records enable row level security;
create policy "consent_records_read_own" on public.consent_records
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;

-- Audit: acceptances and document publishes flow into the subsystem-3 audit log.
create trigger audit_consent_records after insert or update or delete on public.consent_records
  for each row execute function public.record_audit();
create trigger audit_legal_documents after insert or update or delete on public.legal_documents
  for each row execute function public.record_audit();

-- record_consent: sole writer to consent_records. Validates the version is current.
create or replace function public.record_consent(
  p_doc_type public.legal_doc_type, p_version int, p_context public.consent_context,
  p_booking_id uuid default null, p_accepted boolean default true
) returns public.consent_records
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_doc public.legal_documents; v_row public.consent_records;
begin
  select * into v_doc from public.legal_documents
    where doc_type = p_doc_type and version = p_version and is_current;
  if not found then
    raise exception 'That document version is out of date. Please refresh and try again.';
  end if;
  insert into public.consent_records (user_id, document_id, doc_type, version, context, booking_id, accepted)
  values (auth.uid(), v_doc.id, p_doc_type, p_version, p_context, p_booking_id, p_accepted)
  returning * into v_row;
  return v_row;
end; $$;
revoke all on function public.record_consent(public.legal_doc_type, int, public.consent_context, uuid, boolean) from public, anon;
grant execute on function public.record_consent(public.legal_doc_type, int, public.consent_context, uuid, boolean) to authenticated;

-- outstanding_consents: required, current, role-applicable docs not yet accepted.
create or replace function public.outstanding_consents(p_user uuid default auth.uid())
returns table(doc_type public.legal_doc_type, version int, title text, body text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  select role::text into v_role from public.profiles where id = p_user;
  return query
    select d.doc_type, d.version, d.title, d.body
    from public.legal_documents d
    where d.is_current and d.is_required
      and (d.applies_to_roles is null or v_role = any(d.applies_to_roles))
      and not exists (
        select 1 from public.consent_records c
        where c.user_id = p_user and c.doc_type = d.doc_type
          and c.version = d.version and c.accepted)
    order by d.doc_type;
end; $$;
revoke all on function public.outstanding_consents(uuid) from public, anon;
grant execute on function public.outstanding_consents(uuid) to authenticated;

create or replace function public.has_outstanding_required_consent(p_user uuid default auth.uid())
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.outstanding_consents(p_user));
$$;
revoke all on function public.has_outstanding_required_consent(uuid) from public, anon;
grant execute on function public.has_outstanding_required_consent(uuid) to authenticated;

-- publish_legal_document: super-admin only. Bumps version, flips is_current.
create or replace function public.publish_legal_document(
  p_doc_type public.legal_doc_type, p_title text, p_body text,
  p_is_required boolean, p_applies_to_roles text[] default null
) returns public.legal_documents
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_next int; v_row public.legal_documents;
begin
  if not public.is_super_admin() then raise exception 'Super administrator only'; end if;
  select coalesce(max(version), 0) + 1 into v_next
    from public.legal_documents where doc_type = p_doc_type;
  update public.legal_documents set is_current = false
    where doc_type = p_doc_type and is_current;
  insert into public.legal_documents
    (doc_type, version, title, body, is_required, applies_to_roles, is_current, published_by)
  values (p_doc_type, v_next, p_title, p_body, p_is_required, p_applies_to_roles, true, auth.uid())
  returning * into v_row;
  return v_row;
end; $$;
revoke all on function public.publish_legal_document(public.legal_doc_type, text, text, boolean, text[]) from public, anon;
grant execute on function public.publish_legal_document(public.legal_doc_type, text, text, boolean, text[]) to authenticated;

-- Seed version 1 of all five documents (DRAFT text; replace via the editor later).
insert into public.legal_documents (doc_type, version, title, body, is_required, applies_to_roles) values
('terms', 1, 'Terms of Service',
 E'DRAFT for alpha testing, not legal advice, review before public launch.\n\n'
 '## Terms of Service\n\n'
 'Kariba Lake Access connects tourists, hotels and lodges, and boat owners for boat '
 'bookings on Lake Kariba. By using the platform you agree to use it lawfully, to '
 'provide accurate information, and to treat other users and their property with care.\n\n'
 '1. Bookings are agreements between the guest and the boat owner. The platform '
 'facilitates the connection and records the booking.\n'
 '2. You are responsible for the accuracy of the details you provide.\n'
 '3. The platform is provided as is during alpha testing and no real payments are processed.\n'
 '4. We may suspend accounts that abuse the platform or endanger others.', true, null),
('privacy', 1, 'Privacy Policy',
 E'DRAFT for alpha testing, not legal advice, review before public launch.\n\n'
 '## Privacy Policy\n\n'
 'We collect the details you provide (name, contact, business name where relevant) and '
 'booking activity, to operate the platform.\n\n'
 '1. We use your data to manage your account, bookings, and verification.\n'
 '2. We do not sell your personal data.\n'
 '3. Boat owners see the guest details needed to fulfil a booking.\n'
 '4. You may request correction or deletion of your data by contacting the team.', true, null),
('operator_agreement', 1, 'Operator Agreement',
 E'DRAFT for alpha testing, not legal advice, review before public launch.\n\n'
 '## Operator Agreement\n\n'
 'This agreement applies to boat owners and to hotels and lodges listing or booking on '
 'behalf of guests.\n\n'
 '1. You confirm you are entitled to list and operate the vessels you register.\n'
 '2. Listings must be accurate: capacity, pricing, safety equipment, and availability.\n'
 '3. You will maintain vessels in safe, seaworthy condition and carry the safety '
 'equipment your listing claims.\n'
 '4. A platform commission may apply to confirmed bookings, shown to you before launch.\n'
 '5. You will honour confirmed bookings or give reasonable notice of changes.', true, array['owner','hotel']),
('booking_waiver', 1, 'Booking Liability Waiver',
 E'DRAFT for alpha testing, not legal advice, review before public launch.\n\n'
 '## Booking Liability Waiver\n\n'
 'Boating on Lake Kariba carries inherent risks including weather, water conditions, and '
 'wildlife. By confirming this booking you acknowledge that:\n\n'
 '1. You will follow the operator safety briefing and crew instructions.\n'
 '2. Weather and lake conditions may require the trip to be changed or cancelled for safety.\n'
 '3. You assume the ordinary risks of a lake excursion for yourself and your group.\n'
 '4. You will ensure your group wears provided safety equipment such as life jackets.', false, null),
('marketing', 1, 'Marketing Communications',
 E'DRAFT for alpha testing, not legal advice, review before public launch.\n\n'
 '## Marketing Communications\n\n'
 'Opt in to receive occasional updates about new boats, offers, and lake tourism news by '
 'email or WhatsApp. This is optional and you can opt out at any time. Declining does not '
 'affect your ability to use the platform.', false, null);
```

- [ ] **Step 2: Apply the migration**

Use MCP `apply_migration` with project_id `sbrsptgpnjljnongklus`, name `add_terms_and_consent`, and the exact file text.
Expected: success, no error.

- [ ] **Step 3: Verify seed and read functions (SQL probe)**

Run via MCP `execute_sql` (project `sbrsptgpnjljnongklus`):
```sql
select doc_type, version, is_required, applies_to_roles, is_current
from public.legal_documents order by doc_type;
```
Expected: 5 rows, all `is_current = true`, version 1. `terms`/`privacy` required with null roles; `operator_agreement` required with `{owner,hotel}`; `booking_waiver`/`marketing` not required.

- [ ] **Step 4: Verify record + outstanding via an authenticated call**

Sign up a throwaway tourist and record consent, then check outstanding is empty for the accepted docs. In bash:
```bash
REF="sbrsptgpnjljnongklus"; KEY="sb_publishable_N-POTGTvRCFjkz9M5tS4gQ_pAHtY5_W"
TOK=$(curl -s -X POST "https://$REF.supabase.co/auth/v1/signup" -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"c4-tourist@kariba.com","password":"tourist12345","data":{"full_name":"C4 Tourist","role":"tourist"}}' \
  | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"//')
rpc(){ curl -s -X POST "https://$REF.supabase.co/rest/v1/rpc/$1" -H "apikey: $KEY" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "$2"; }
echo "outstanding BEFORE (expect terms + privacy):"; rpc outstanding_consents '{}'
rpc record_consent '{"p_doc_type":"terms","p_version":1,"p_context":"signup"}' > /dev/null
rpc record_consent '{"p_doc_type":"privacy","p_version":1,"p_context":"signup"}' > /dev/null
echo "outstanding AFTER (expect []):"; rpc outstanding_consents '{}'
```
Expected: BEFORE lists `terms` and `privacy` (NOT operator_agreement, since role is tourist); AFTER is `[]`.

- [ ] **Step 5: Verify append-only (consent_records cannot be edited)**

```bash
ROWID=$(curl -s "https://$REF.supabase.co/rest/v1/consent_records?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $TOK" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
curl -s -o /dev/null -w "PATCH %{http_code}\n" -X PATCH "https://$REF.supabase.co/rest/v1/consent_records?id=eq.$ROWID" -H "apikey: $KEY" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"accepted":false}'
curl -s -o /dev/null -w "DELETE %{http_code}\n" -X DELETE "https://$REF.supabase.co/rest/v1/consent_records?id=eq.$ROWID" -H "apikey: $KEY" -H "Authorization: Bearer $TOK"
```
Expected: `PATCH 403` and `DELETE 403`.

- [ ] **Step 6: Clean the throwaway**

```sql
delete from auth.users where email = 'c4-tourist@kariba.com';
delete from public.audit_log;
```
Expected: no error. (audit_log wiped so alpha stays pristine; it will be re-verified in Task 8.)

- [ ] **Step 7: Commit**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git add supabase/migrations/18_add_terms_and_consent.sql
& git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add legal documents and consent ledger (migration 18)"
```

---

## Task 2: Migration 19 — enforcement and create_booking

Adds the consent guard to gated RPCs and replaces the direct bookings INSERT with a `create_booking` RPC that records the waiver atomically. Depends on Task 1 (`has_outstanding_required_consent`).

**Files:**
- Create: `supabase/migrations/19_enforce_consent_and_create_booking.sql`
- Apply: via MCP `apply_migration` (name `enforce_consent_and_create_booking`)

**Interfaces:**
- Consumes: `public.has_outstanding_required_consent()` (Task 1).
- Produces:
  - `create_booking(p_boat_id uuid, p_guest_name text, p_guest_phone text, p_hotel_id uuid, p_start_date date, p_days int, p_start_time time, p_duration_hours numeric, p_group_size int, p_experience_type text, p_price_total numeric, p_deposit_amount numeric, p_notes text, p_waiver_version int, p_waiver_accepted boolean) returns table(id uuid, deposit_amount numeric)`
  - The `bookings_insert_authenticated` policy is dropped; direct client INSERT on `bookings` is no longer possible.
  - Consent guard added to `submit_boat_for_review`, `propose_boat_changes`, `owner_set_booking_status`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/19_enforce_consent_and_create_booking.sql` with exactly:

```sql
-- Subsystem 4 enforcement. Gated write RPCs now refuse to run while the caller is
-- behind on a required consent. Booking creation moves from a direct client INSERT
-- (permissive WITH CHECK (true) policy) to a create_booking RPC that checks consent
-- and records the booking waiver in the same transaction, so no booking exists
-- without its waiver. The old insert policy is dropped.

drop policy if exists "bookings_insert_authenticated" on public.bookings;

create or replace function public.create_booking(
  p_boat_id uuid, p_guest_name text, p_guest_phone text, p_hotel_id uuid,
  p_start_date date, p_days int, p_start_time time, p_duration_hours numeric,
  p_group_size int, p_experience_type text, p_price_total numeric, p_deposit_amount numeric,
  p_notes text, p_waiver_version int, p_waiver_accepted boolean
) returns table(id uuid, deposit_amount numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_dep numeric; v_tourist uuid; v_doc public.legal_documents;
begin
  if public.has_outstanding_required_consent() then
    raise exception 'Consent required';
  end if;
  if not coalesce(p_waiver_accepted, false) then
    raise exception 'You must accept the booking waiver to continue.';
  end if;
  select * into v_doc from public.legal_documents
    where doc_type = 'booking_waiver' and version = p_waiver_version and is_current;
  if not found then
    raise exception 'The booking waiver was updated. Please refresh and try again.';
  end if;

  v_tourist := case when p_hotel_id is null then auth.uid() else null end;

  begin
    insert into public.bookings
      (boat_id, tourist_id, hotel_id, guest_name, guest_phone, start_date, days,
       start_time, duration_hours, group_size, experience_type, price_total, deposit_amount, notes)
    values
      (p_boat_id, v_tourist, p_hotel_id, p_guest_name, p_guest_phone, p_start_date, p_days,
       p_start_time, p_duration_hours, p_group_size, p_experience_type, p_price_total, p_deposit_amount, p_notes)
    returning bookings.id, bookings.deposit_amount into v_id, v_dep;
  exception when exclusion_violation then
    raise exception 'That slot was just booked by someone else. Pick another time.';
  end;

  insert into public.consent_records (user_id, document_id, doc_type, version, context, booking_id, accepted)
  values (auth.uid(), v_doc.id, 'booking_waiver', p_waiver_version, 'booking', v_id, true);

  id := v_id; deposit_amount := v_dep; return next;
end; $$;
revoke all on function public.create_booking(uuid, text, text, uuid, date, int, time, numeric, int, text, numeric, numeric, text, int, boolean) from public, anon;
grant execute on function public.create_booking(uuid, text, text, uuid, date, int, time, numeric, int, text, numeric, numeric, text, int, boolean) to authenticated;

-- Add the consent guard to the existing gated RPCs (full bodies preserved).
create or replace function public.submit_boat_for_review(p_boat_id uuid)
 returns boats language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;
  if (select verification_status from public.profiles where id = auth.uid()) <> 'verified' then
    raise exception 'Your owner account is pending verification. An admin will review it before your boats can go live.';
  end if;
  if v_boat.status not in ('draft','rejected') then
    raise exception 'Only a draft or rejected boat can be submitted for review';
  end if;
  if not exists (select 1 from public.boat_images where boat_id = p_boat_id) then
    raise exception 'Add at least one photo before submitting for review';
  end if;
  update public.boats set status = 'pending', rejection_reason = null
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $function$;

create or replace function public.owner_set_booking_status(p_booking_id uuid, p_status booking_status)
 returns bookings language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_booking public.bookings; v_owner uuid; v_ok boolean;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_owner <> auth.uid() then
    raise exception 'Only the boat owner can change this booking';
  end if;
  v_ok := case v_booking.status
    when 'requested' then p_status in ('confirmed','declined','cancelled')
    when 'confirmed' then p_status in ('deposit_paid','completed','cancelled')
    when 'deposit_paid' then p_status in ('completed','cancelled')
    else false end;
  if not v_ok then raise exception 'Cannot change a % booking to %', v_booking.status, p_status; end if;
  update public.bookings set status = p_status where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $function$;

create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
 returns boats language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;

  perform set_config('app.boat_hours_ctx', 'on', true);
  if v_boat.status = 'approved' and public.is_sensitive_change(p_changes) then
    update public.boats
    set pending_changes = coalesce(pending_changes, '{}'::jsonb) || p_changes
    where id = p_boat_id returning * into v_boat;
  else
    update public.boats set
      name = coalesce(p_changes->>'name', name),
      description = coalesce(p_changes->>'description', description),
      location = coalesce(p_changes->>'location', location),
      capacity = coalesce((p_changes->>'capacity')::int, capacity),
      price_per_hour = coalesce((p_changes->>'price_per_hour')::numeric, price_per_hour),
      price_per_day = coalesce((p_changes->>'price_per_day')::numeric, price_per_day),
      facilities = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_changes->'facilities')),
        facilities),
      safety_equipment = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_changes->'safety_equipment')),
        safety_equipment),
      crew_included = coalesce((p_changes->>'crew_included')::boolean, crew_included),
      fuel_policy = coalesce((p_changes->>'fuel_policy')::fuel_policy_kind, fuel_policy),
      registration_number = coalesce(p_changes->>'registration_number', registration_number),
      boat_type = coalesce((p_changes->>'boat_type')::boat_kind, boat_type),
      maintenance_interval_hours = coalesce(
        (p_changes->>'maintenance_interval_hours')::numeric, maintenance_interval_hours),
      is_active = coalesce((p_changes->>'is_active')::boolean, is_active)
    where id = p_boat_id returning * into v_boat;
  end if;
  perform set_config('app.boat_hours_ctx', 'off', true);
  return v_boat;
end; $function$;
```

- [ ] **Step 2: Apply the migration**

MCP `apply_migration`, project `sbrsptgpnjljnongklus`, name `enforce_consent_and_create_booking`, exact text.
Expected: success.

- [ ] **Step 3: Verify the guard blocks an un-consented owner**

```bash
REF="sbrsptgpnjljnongklus"; KEY="sb_publishable_N-POTGTvRCFjkz9M5tS4gQ_pAHtY5_W"
TOK=$(curl -s -X POST "https://$REF.supabase.co/auth/v1/signup" -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"c4-owner@kariba.com","password":"owner12345","data":{"full_name":"C4 Owner","role":"owner"}}' \
  | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"//')
# Owner has accepted nothing yet, so a gated RPC must refuse:
curl -s -X POST "https://$REF.supabase.co/rest/v1/rpc/submit_boat_for_review" -H "apikey: $KEY" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"p_boat_id":"00000000-0000-0000-0000-000000000000"}'
```
Expected: JSON error containing `Consent required` (not "Boat not found"), proving the guard runs first.

- [ ] **Step 4: Verify create_booking records the waiver**

Use a verified owner + an approved boat is heavy to set up here; instead assert the waiver-gate and consent-gate paths directly. After the owner above accepts required docs, a booking with `p_waiver_accepted=false` must fail:
```bash
rpc(){ curl -s -X POST "https://$REF.supabase.co/rest/v1/rpc/$1" -H "apikey: $KEY" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "$2"; }
rpc record_consent '{"p_doc_type":"terms","p_version":1,"p_context":"signup"}' > /dev/null
rpc record_consent '{"p_doc_type":"privacy","p_version":1,"p_context":"signup"}' > /dev/null
rpc record_consent '{"p_doc_type":"operator_agreement","p_version":1,"p_context":"signup"}' > /dev/null
echo "waiver not accepted (expect waiver error):"
rpc create_booking '{"p_boat_id":"00000000-0000-0000-0000-000000000000","p_guest_name":"x","p_guest_phone":"x","p_hotel_id":null,"p_start_date":"2026-08-01","p_days":1,"p_start_time":null,"p_duration_hours":null,"p_group_size":2,"p_experience_type":"sunset","p_price_total":100,"p_deposit_amount":20,"p_notes":null,"p_waiver_version":1,"p_waiver_accepted":false}'
```
Expected: error `You must accept the booking waiver to continue.` (End-to-end booking with a real approved boat is covered in Task 8 in-browser.)

- [ ] **Step 5: Clean throwaway**

```sql
delete from auth.users where email = 'c4-owner@kariba.com';
delete from public.audit_log;
```

- [ ] **Step 6: Commit**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git add supabase/migrations/19_enforce_consent_and_create_booking.sql
& git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Enforce consent on gated RPCs and add create_booking (migration 19)"
```

---

## Task 3: Types and legal service

Regenerate the database types and add the service layer the UI consumes.

**Files:**
- Modify: `src/types/database.ts` (regenerate)
- Create: `src/services/legal.service.ts`

**Interfaces:**
- Produces:
  - `LegalDocType = 'terms' | 'privacy' | 'operator_agreement' | 'booking_waiver' | 'marketing'`
  - `interface LegalDocument { id; docType: LegalDocType; version: number; title: string; body: string; isRequired: boolean; appliesToRoles: string[] | null; isCurrent: boolean; }`
  - `interface OutstandingConsent { docType: LegalDocType; version: number; title: string; body: string; }`
  - `listCurrentDocuments(): Promise<LegalDocument[]>`
  - `getCurrentDocument(docType: LegalDocType): Promise<LegalDocument | null>`
  - `outstandingConsents(): Promise<OutstandingConsent[]>`
  - `recordConsent(input: { docType: LegalDocType; version: number; context: 'signup'|'re_consent'|'booking'; bookingId?: string; accepted?: boolean }): Promise<void>`
  - `publishDocument(input: { docType: LegalDocType; title: string; body: string; isRequired: boolean; appliesToRoles: string[] | null }): Promise<void>`

- [ ] **Step 1: Regenerate database types**

Use MCP `generate_typescript_types` (project `sbrsptgpnjljnongklus`) and overwrite `src/types/database.ts` with the returned content.

- [ ] **Step 2: Verify types compile and include the new objects**

Run: `npx tsc --noEmit`
Expected: exit 0. Confirm `legal_documents`, `consent_records`, `record_consent`, `outstanding_consents`, `publish_legal_document`, and `create_booking` appear in the generated file.

- [ ] **Step 3: Write the service**

Create `src/services/legal.service.ts`:
```ts
import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export type LegalDocType = 'terms' | 'privacy' | 'operator_agreement' | 'booking_waiver' | 'marketing';

export interface LegalDocument {
  id: string; docType: LegalDocType; version: number; title: string; body: string;
  isRequired: boolean; appliesToRoles: string[] | null; isCurrent: boolean;
}
export interface OutstandingConsent {
  docType: LegalDocType; version: number; title: string; body: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDoc(r: any): LegalDocument {
  return {
    id: r.id, docType: r.doc_type, version: r.version, title: r.title, body: r.body,
    isRequired: r.is_required, appliesToRoles: r.applies_to_roles, isCurrent: r.is_current,
  };
}

export async function listCurrentDocuments(): Promise<LegalDocument[]> {
  const { data, error } = await supabase
    .from('legal_documents').select('*').eq('is_current', true).order('doc_type');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(mapDoc);
}

export async function getCurrentDocument(docType: LegalDocType): Promise<LegalDocument | null> {
  const { data, error } = await supabase
    .from('legal_documents').select('*').eq('is_current', true).eq('doc_type', docType).maybeSingle();
  if (error) throw new Error(humanizeError(error.message));
  return data ? mapDoc(data) : null;
}

export async function outstandingConsents(): Promise<OutstandingConsent[]> {
  const { data, error } = await supabase.rpc('outstanding_consents', {});
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r: any) => ({
    docType: r.doc_type, version: r.version, title: r.title, body: r.body,
  }));
}

export async function recordConsent(input: {
  docType: LegalDocType; version: number;
  context: 'signup' | 're_consent' | 'booking'; bookingId?: string; accepted?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('record_consent', {
    p_doc_type: input.docType, p_version: input.version, p_context: input.context,
    p_booking_id: input.bookingId ?? undefined, p_accepted: input.accepted ?? true,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function publishDocument(input: {
  docType: LegalDocType; title: string; body: string;
  isRequired: boolean; appliesToRoles: string[] | null;
}): Promise<void> {
  const { error } = await supabase.rpc('publish_legal_document', {
    p_doc_type: input.docType, p_title: input.title, p_body: input.body,
    p_is_required: input.isRequired, p_applies_to_roles: input.appliesToRoles ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git add src/types/database.ts src/services/legal.service.ts
& git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add legal document types and service"
```

---

## Task 4: DocumentModal and signup consent checkboxes

Adds a reusable document viewer and the required/optional consent checkboxes to signup, then records consent after account creation.

**Files:**
- Create: `src/components/legal/DocumentModal.tsx`
- Create: `src/components/legal/useCurrentDocuments.ts`
- Modify: `src/pages/Signup.tsx`

**Interfaces:**
- Consumes: `getCurrentDocument`, `listCurrentDocuments`, `recordConsent`, `LegalDocType` (Task 3); `useAuth().signup` returning the new user.
- Produces: `DocumentModal({ docType, onClose })`; `useCurrentDocuments()` returning `{ docs, loading }` map by docType.

- [ ] **Step 1: Write the current-documents hook**

Create `src/components/legal/useCurrentDocuments.ts`:
```ts
import { useEffect, useState } from 'react';
import { listCurrentDocuments, type LegalDocument, type LegalDocType } from '../../services/legal.service';

export function useCurrentDocuments() {
  const [docs, setDocs] = useState<Record<string, LegalDocument>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    listCurrentDocuments()
      .then((list) => { if (live) setDocs(Object.fromEntries(list.map((d) => [d.docType, d]))); })
      .catch(() => { if (live) setDocs({}); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  const get = (t: LegalDocType) => docs[t];
  return { docs, get, loading };
}
```

- [ ] **Step 2: Write the DocumentModal**

Create `src/components/legal/DocumentModal.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getCurrentDocument, type LegalDocType, type LegalDocument } from '../../services/legal.service';

export default function DocumentModal({ docType, onClose }: { docType: LegalDocType; onClose: () => void }) {
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    getCurrentDocument(docType)
      .then((d) => { if (live) setDoc(d); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [docType]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-lake-100 px-5 py-3">
          <h3 className="font-semibold text-lake-950">{doc?.title ?? 'Document'}</h3>
          <button onClick={onClose} className="text-lake-400 hover:text-lake-700"><X size={18} /></button>
        </div>
        <div className="max-h-[64vh] overflow-y-auto px-5 py-4 text-sm text-lake-700 whitespace-pre-wrap">
          {loading ? 'Loading...' : doc ? doc.body : 'This document is not available yet.'}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add consent state and checkboxes to Signup**

In `src/pages/Signup.tsx`:

(a) Add imports near the top:
```tsx
import { useCurrentDocuments } from '../components/legal/useCurrentDocuments';
import DocumentModal from '../components/legal/DocumentModal';
import { recordConsent, type LegalDocType } from '../services/legal.service';
```

(b) Inside the component, after the existing `useState` hooks, add:
```tsx
const { get: getDoc } = useCurrentDocuments();
const [acceptTerms, setAcceptTerms] = useState(false);
const [acceptOperator, setAcceptOperator] = useState(false);
const [marketingOptIn, setMarketingOptIn] = useState(false);
const [viewDoc, setViewDoc] = useState<LegalDocType | null>(null);
const needsOperator = role === 'owner' || role === 'hotel';
```

(c) In `submit`, replace the block that calls `signup(...)` and navigates so that it validates consent, then records it. Insert right after the `password.length < 6` check:
```tsx
if (!acceptTerms) {
  setError('Please accept the Terms of Service and Privacy Policy to continue.');
  return;
}
if (needsOperator && !acceptOperator) {
  setError('Please accept the Operator Agreement to continue.');
  return;
}
```
Then change the `try` body so that after a successful `signup(...)` (when no email confirmation is needed) it records consent before navigating:
```tsx
const result = await signup({
  email, password, fullName: name, role,
  phone: phone || undefined, businessName: businessName || undefined,
});
if (result.needsConfirmation) {
  setConfirmSent(true);
} else {
  const docTypes: { t: LegalDocType; accepted: boolean }[] = [
    { t: 'terms', accepted: true },
    { t: 'privacy', accepted: true },
  ];
  if (needsOperator) docTypes.push({ t: 'operator_agreement', accepted: true });
  docTypes.push({ t: 'marketing', accepted: marketingOptIn });
  for (const d of docTypes) {
    const doc = getDoc(d.t);
    if (doc) await recordConsent({ docType: d.t, version: doc.version, context: 'signup', accepted: d.accepted });
  }
  navigate('/', { replace: true });
}
```

(d) Add the checkboxes to the form, right before the `{error && ...}` block:
```tsx
<div className="space-y-2 pt-1">
  <label className="flex items-start gap-2 text-xs text-lake-600">
    <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
      className="mt-0.5" />
    <span>
      I accept the{' '}
      <button type="button" className="font-semibold text-lake-700 underline" onClick={() => setViewDoc('terms')}>Terms of Service</button>
      {' '}and{' '}
      <button type="button" className="font-semibold text-lake-700 underline" onClick={() => setViewDoc('privacy')}>Privacy Policy</button>.
    </span>
  </label>
  {needsOperator && (
    <label className="flex items-start gap-2 text-xs text-lake-600">
      <input type="checkbox" checked={acceptOperator} onChange={(e) => setAcceptOperator(e.target.checked)}
        className="mt-0.5" />
      <span>
        I accept the{' '}
        <button type="button" className="font-semibold text-lake-700 underline" onClick={() => setViewDoc('operator_agreement')}>Operator Agreement</button>.
      </span>
    </label>
  )}
  <label className="flex items-start gap-2 text-xs text-lake-500">
    <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}
      className="mt-0.5" />
    <span>Send me occasional updates and offers (optional).</span>
  </label>
</div>
```

(e) Render the modal right before the closing `</AuthCard>`:
```tsx
{viewDoc && <DocumentModal docType={viewDoc} onClose={() => setViewDoc(null)} />}
```

- [ ] **Step 4: Verify compile and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git add src/components/legal/ src/pages/Signup.tsx
& git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add document viewer and signup consent capture"
```

---

## Task 5: Re-consent gate

Blocks the app when the logged-in user is behind on a required document, offering view + accept.

**Files:**
- Create: `src/components/legal/ConsentGate.tsx`
- Modify: `src/data/AuthContext.tsx` (expose an outstanding-consents check and a refresh)
- Modify: `src/App.tsx` (wrap authenticated routes with ConsentGate)

**Interfaces:**
- Consumes: `outstandingConsents`, `recordConsent` (Task 3); `useAuth().currentUser`.
- Produces: `ConsentGate({ children })` that renders a blocking accept screen while outstanding consents exist, else `children`.

- [ ] **Step 1: Inspect AuthContext and App to confirm insertion points**

Read `src/data/AuthContext.tsx` and `src/App.tsx`. Confirm `currentUser` is exposed by `useAuth()` and identify where authenticated routes are rendered (the element tree under the router). ConsentGate wraps that tree.

- [ ] **Step 2: Write ConsentGate**

Create `src/components/legal/ConsentGate.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../data/AuthContext';
import { outstandingConsents, recordConsent, type OutstandingConsent } from '../../services/legal.service';

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<OutstandingConsent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    if (!currentUser) { setItems([]); return; }
    outstandingConsents().then(setItems).catch(() => setItems([]));
  }, [currentUser]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!currentUser || items === null || items.length === 0) return <>{children}</>;

  const acceptAll = async () => {
    setBusy(true); setError('');
    try {
      for (const it of items) {
        await recordConsent({ docType: it.docType, version: it.version, context: 're_consent' });
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your acceptance.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-lake-950/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-lake-100 px-5 py-4">
          <ShieldCheck className="text-lake-700" size={20} />
          <h2 className="font-semibold text-lake-950">Please review our updated terms</h2>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-lake-600">
            We have updated the following. Please read and accept to continue using Kariba Lake Access.
          </p>
          {items.map((it) => (
            <div key={it.docType} className="rounded-xl border border-lake-100 p-3">
              <h3 className="text-sm font-semibold text-lake-900">{it.title}</h3>
              <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-lake-600">{it.body}</div>
            </div>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="border-t border-lake-100 px-5 py-3">
          <button onClick={acceptAll} disabled={busy}
            className="w-full rounded-lg bg-sunset-500 py-2.5 text-sm font-semibold text-white hover:bg-sunset-600 disabled:opacity-60">
            {busy ? 'Recording' : 'I accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wrap authenticated routes with ConsentGate**

In `src/App.tsx`, import ConsentGate and wrap the routed app content (inside the auth provider, around the `<Routes>` or the layout that renders them):
```tsx
import ConsentGate from './components/legal/ConsentGate';
```
Wrap the existing routes element:
```tsx
<ConsentGate>
  {/* existing <Routes>...</Routes> */}
</ConsentGate>
```
ConsentGate returns children unchanged when there is no logged-in user or nothing outstanding, so public pages and login are unaffected.

- [ ] **Step 4: Verify compile and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git add src/components/legal/ConsentGate.tsx src/App.tsx src/data/AuthContext.tsx
& git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add re-consent gate for updated required documents"
```

---

## Task 6: Booking waiver

Adds the required waiver checkbox to the booking form and routes booking creation through the `create_booking` RPC.

**Files:**
- Modify: `src/services/bookings.service.ts` (`createBooking` calls the RPC and passes the waiver)
- Modify: `src/components/BookingModal.tsx` (waiver checkbox + version)

**Interfaces:**
- Consumes: `create_booking` RPC (Task 2), `getCurrentDocument`/`DocumentModal` (Tasks 3, 4).
- Produces: `createBooking(input, touristId)` unchanged in signature but now takes `input.waiverVersion` and `input.waiverAccepted`; add both to `BookingInput`.

- [ ] **Step 1: Point createBooking at the RPC**

In `src/services/bookings.service.ts`, add `waiverVersion: number; waiverAccepted: boolean;` to the `BookingInput` interface, then replace the `createBooking` body:
```ts
export async function createBooking(input: BookingInput, touristId: string | null) {
  void touristId; // tourist_id is derived server-side in create_booking
  const { data, error } = await supabase.rpc('create_booking', {
    p_boat_id: input.boatId, p_guest_name: input.guestName, p_guest_phone: input.guestPhone,
    p_hotel_id: input.hotelId ?? undefined,
    p_start_date: input.startDate, p_days: input.days,
    p_start_time: input.startTime ?? undefined, p_duration_hours: input.durationHours ?? undefined,
    p_group_size: input.groupSize, p_experience_type: input.experienceType,
    p_price_total: input.priceTotal, p_deposit_amount: input.depositAmount,
    p_notes: input.notes ?? undefined,
    p_waiver_version: input.waiverVersion, p_waiver_accepted: input.waiverAccepted,
  }).single();
  if (error) throw new Error(humanizeError(error.message));
  const row = data as { id: string; deposit_amount: number };
  return { id: row.id, depositAmount: Number(row.deposit_amount) };
}
```
(The `.single()` works because `create_booking` returns exactly one row. Keep the existing `BookingInput`, `BookingRow`, and other functions.)

- [ ] **Step 2: Add the waiver checkbox to BookingModal**

In `src/components/BookingModal.tsx`:

(a) Add imports:
```tsx
import { useCurrentDocuments } from './legal/useCurrentDocuments';
import DocumentModal from './legal/DocumentModal';
```
(b) Add state near the other `useState` calls:
```tsx
const { get: getDoc } = useCurrentDocuments();
const [waiverAccepted, setWaiverAccepted] = useState(false);
const [showWaiver, setShowWaiver] = useState(false);
```
(c) In `submit`, before calling `createBooking`, guard on the waiver, and pass the version:
```tsx
if (!waiverAccepted) {
  setError('Please accept the booking waiver to continue.');
  setStep('form');
  return;
}
const waiverDoc = getDoc('booking_waiver');
```
Then add to the `createBooking` input object:
```tsx
waiverVersion: waiverDoc?.version ?? 1,
waiverAccepted: true,
```
(d) Add the checkbox in the form, just before the submit button:
```tsx
<label className="flex items-start gap-2 text-xs text-lake-600">
  <input type="checkbox" checked={waiverAccepted} onChange={(e) => setWaiverAccepted(e.target.checked)} className="mt-0.5" />
  <span>
    I accept the{' '}
    <button type="button" className="font-semibold text-lake-700 underline" onClick={() => setShowWaiver(true)}>booking liability waiver</button>.
  </span>
</label>
```
(e) Render the modal near the end of the component's JSX:
```tsx
{showWaiver && <DocumentModal docType="booking_waiver" onClose={() => setShowWaiver(false)} />}
```

- [ ] **Step 3: Verify compile and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git add src/services/bookings.service.ts src/components/BookingModal.tsx
& git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Capture booking liability waiver via create_booking RPC"
```

---

## Task 7: Admin document editor and Activity log filter

Super-admin-only editor to view and publish new document versions, plus a `consent_records` option in the Activity log filter.

**Files:**
- Create: `src/components/admin/LegalDocuments.tsx`
- Modify: `src/pages/AdminDashboard.tsx` (super-admin tile + view)
- Modify: `src/components/admin/AuditLog.tsx` (add `consent_records` and `legal_documents` to ENTITY_TYPES)

**Interfaces:**
- Consumes: `listCurrentDocuments`, `publishDocument` (Task 3); `useAuth().currentUser.isSuperAdmin`; existing `useAsync`, `StateViews`.
- Produces: admin panel `LegalDocuments`.

- [ ] **Step 1: Write the editor**

Create `src/components/admin/LegalDocuments.tsx`:
```tsx
import { useState } from 'react';
import { LoadingState, ErrorState } from '../StateViews';
import { useAsync } from '../../hooks/useAsync';
import { listCurrentDocuments, publishDocument, type LegalDocument } from '../../services/legal.service';

function Editor({ doc, onPublished }: { doc: LegalDocument; onPublished: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const publish = async () => {
    setBusy(true); setMsg('');
    try {
      await publishDocument({
        docType: doc.docType, title, body,
        isRequired: doc.isRequired, appliesToRoles: doc.appliesToRoles,
      });
      setMsg('Published. This is now version ' + (doc.version + 1) + '.');
      onPublished();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-lake-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lake-950">{doc.docType}</h3>
        <span className="text-xs text-lake-500">current v{doc.version}{doc.isRequired ? ' · required' : ''}</span>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        className="mt-2 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8}
        className="mt-2 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm font-mono" />
      {doc.isRequired && (
        <p className="mt-2 text-xs text-amber-700">
          Publishing a new version of a required document asks every applicable user to accept it again on their next visit.
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-lake-600">{msg}</p>}
      <button onClick={publish} disabled={busy}
        className="mt-2 rounded-lg bg-lake-700 px-4 py-2 text-sm font-semibold text-white hover:bg-lake-800 disabled:opacity-60">
        {busy ? 'Publishing' : 'Publish new version'}
      </button>
    </div>
  );
}

export default function LegalDocuments() {
  const { data, loading, error, reload } = useAsync(listCurrentDocuments, []);
  const docs = data ?? [];
  if (loading) return <LoadingState label="Loading documents" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-3">
      {docs.map((d) => <Editor key={d.docType} doc={d} onPublished={reload} />)}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tile and view into AdminDashboard**

In `src/pages/AdminDashboard.tsx`:
(a) Import: `import LegalDocuments from '../components/admin/LegalDocuments';` and add `FileText` to the lucide import.
(b) Extend the `View` union with `'legal'`.
(c) In the `if (isSuper)` block that pushes the roles tile, also push:
```tsx
tiles.push({ key: 'legal', label: 'Legal documents', value: 0, icon: FileText });
```
(d) Add the view render alongside the others:
```tsx
{view === 'legal' && isSuper && (<><h2 className="mb-3 font-semibold text-lake-950">Legal documents</h2><LegalDocuments /></>)}
```

- [ ] **Step 3: Add consent entities to the Activity log filter**

In `src/components/admin/AuditLog.tsx`, extend `ENTITY_TYPES`:
```tsx
const ENTITY_TYPES = ['boats', 'bookings', 'profiles', 'boat_images', 'reviews', 'hotels', 'consent_records', 'legal_documents'];
```

- [ ] **Step 4: Verify compile, lint, build**

Run: `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git add src/components/admin/LegalDocuments.tsx src/pages/AdminDashboard.tsx src/components/admin/AuditLog.tsx
& git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add super-admin legal document editor and consent audit filter"
```

---

## Task 8: End-to-end verification, cleanup, PR

Prove the whole flow in the browser, run the gates, purge test data, and open the PR.

**Files:** none (verification + cleanup).

- [ ] **Step 1: Start the dev server and verify signup consent**

Start the `kariba-boats` preview. On `/signup`, confirm: submit is blocked until Terms is checked; an owner also sees the Operator agreement checkbox; each link opens the DocumentModal showing DRAFT text. Complete a throwaway owner signup with all required boxes checked and marketing left unchecked.

Then confirm via SQL (MCP `execute_sql`):
```sql
select doc_type, version, context, accepted from public.consent_records
order by accepted_at desc limit 6;
```
Expected: `terms`/`privacy`/`operator_agreement` rows with `accepted=true`, `context=signup`, and a `marketing` row with `accepted=false`.

- [ ] **Step 2: Verify the re-consent gate**

As a super-admin (cyton), open Admin -> Legal documents, edit Terms, and publish a new version. Log in as the throwaway owner (or reload) and confirm the ConsentGate blocks the app listing the updated Terms; click "I accept" and confirm the app is released. Confirm in SQL a `re_consent` row now exists for `terms` version 2.

- [ ] **Step 3: Verify the booking waiver end to end**

Using a verified owner with an approved, active boat and a tourist account (create via the app; verify the owner through the admin verification panel), open a boat, start a booking, and confirm the waiver checkbox is required. Complete the booking and confirm in SQL that a `booking_waiver` consent row exists with the new `booking_id` and `context=booking`, and that the booking exists. Attempting to submit without the waiver shows the friendly error.

- [ ] **Step 4: Verify append-only + authorization once more**

Confirm `consent_records` PATCH/DELETE via REST return 403 (reuse the Task 1 Step 5 snippet with a fresh token). Confirm a non-super-admin cannot see the Legal documents tile (log in as a plain owner: the tile is absent) and that `publish_legal_document` called with a non-super token returns `Super administrator only`.

- [ ] **Step 5: Security advisor + gates**

Run MCP `get_advisors` (type `security`). Expected: no new ERROR; the previously-flagged `bookings_insert_authenticated` permissive-policy WARN is GONE (the policy was dropped). New definer functions must NOT appear in the mutable-search_path lint. Then run `npm run build` and `npm run lint`; expected exit 0 each.

- [ ] **Step 6: Purge all test data for pristine alpha**

```sql
-- All @kariba.com accounts are throwaway testers; cyton is @agri-forge.net and is never matched.
delete from auth.users where email like '%@kariba.com';
delete from public.bookings;
delete from public.consent_records;
delete from public.audit_log;
-- Reset documents to version 1 only (drop the test v2 Terms), keeping one current row each:
delete from public.legal_documents where not (version = 1);
update public.legal_documents set is_current = true where version = 1;
select
  (select count(*) from public.legal_documents) as docs,
  (select count(*) from public.consent_records) as consents,
  (select json_build_object('email', u.email, 'role', p.role, 'is_super_admin', p.is_super_admin)
     from public.profiles p join auth.users u on u.id = p.id
     where u.email = 'cyton.kwanisi@agri-forge.net') as cyton;
```
Expected: `docs = 5`, `consents = 0`, cyton is admin + super_admin. (Confirm no throwaway owner/tourist/hotel accounts remain; if the app auto-created boats/hotels rows for them, delete those too.)

- [ ] **Step 7: Push and open the PR**

```powershell
Set-Location "C:\Users\paulo\kariba-boats"
& git push -u origin feat/terms-consent
```
Then create the PR with `gh` using a body file (bash heredocs and inline bodies have failed here before): write the summary to a scratchpad `.md` and run
`gh pr create --title "Subsystem 4: Terms, consent, and legal agreements" --body-file <path> --base main --head feat/terms-consent`.
Present the PR link to the user and await "merge it" (do not merge unprompted).

- [ ] **Step 8: Update memory**

Update `C:\Users\paulo\.claude\projects\C--Users-paulo\memory\project_kariba_boats.md`: mark subsystem 4 MERGED (after merge), migrations now run 01..19, note the five seeded legal documents and that booking creation is now the `create_booking` RPC (direct bookings INSERT removed; permissive-INSERT advisory resolved).

---

## Self-Review Notes (author)

- Spec coverage: legal_documents + consent_records + enums (Task 1); role-scoped required set and booking-waiver-as-non-account-gate (Task 1 `outstanding_consents`, `is_required`/`applies_to_roles`); record/outstanding/has-outstanding/publish RPCs (Task 1); server enforcement guard + create_booking + dropped insert policy (Task 2); types + service (Task 3); signup checkboxes + DocumentModal (Task 4); re-consent gate (Task 5); booking waiver (Task 6); super-admin editor + Activity log filter (Task 7); public footer links to Terms/Privacy is the one spec item deliberately deferred as trivial — if desired, add during Task 7 by rendering two `DocumentModal` openers in the footer. Verification, cleanup, audit visibility (Task 8).
- Type consistency: `LegalDocType`, `LegalDocument`, `OutstandingConsent`, and the RPC argument names (`p_doc_type`, `p_version`, `p_context`, `p_booking_id`, `p_accepted`, `p_waiver_version`, `p_waiver_accepted`) are used identically across Tasks 2, 3, 4, 5, 6, 7.
- Placeholder scan: no TBD/TODO; every code step shows complete code; SQL bodies for modified RPCs are reproduced in full (not "add a guard to the existing function").
- Note for the footer links item: it is optional for alpha and not required for the flow to work; call it out to the user rather than silently dropping it.
```
