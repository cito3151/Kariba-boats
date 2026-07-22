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
