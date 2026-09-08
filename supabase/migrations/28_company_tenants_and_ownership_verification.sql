-- Company tenants and proof of company ownership.
--
-- A boat operator is a company, not a person. This migration introduces the tenant
-- (companies + company_members), moves fleet ownership onto it, and turns the existing
-- free-text verification_documents into typed, individually reviewable proofs.
--
-- It deliberately extends migration 23's verification_documents rather than adding a
-- second document table: one bucket, one upload path, one place for the admin to look.

-- 1. The tenant --------------------------------------------------------------

create type company_verification_status as enum ('unverified','pending','verified','rejected');
create type company_member_role as enum ('owner','manager','staff');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  registration_number text,
  contact_email text,
  contact_phone text,
  verification_status company_verification_status not null default 'unverified',
  verification_note text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role company_member_role not null default 'staff',
  added_at timestamptz not null default now(),
  primary key (company_id, profile_id)
);

create index company_members_profile_idx on public.company_members (profile_id);
create index companies_status_idx on public.companies (verification_status);

-- 2. Helpers -----------------------------------------------------------------
-- security definer so the policies below can consult company_members without
-- recursing through that table's own row level security.

create or replace function public.current_user_company()
returns uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select company_id from public.company_members where profile_id = auth.uid() limit 1;
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id and profile_id = auth.uid()
  );
$$;

-- 3. Typed, reviewable documents ---------------------------------------------

create type company_document_kind as enum
  ('company_registration','boat_ownership','operator_licence','director_id');

alter table public.verification_documents
  add column company_id uuid references public.companies(id) on delete cascade,
  add column doc_kind company_document_kind,
  add column review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  add column review_note text,
  add column reviewed_by uuid references public.profiles(id),
  add column reviewed_at timestamptz,
  add column expires_at date;

create index verification_documents_company_idx on public.verification_documents (company_id);
create index verification_documents_review_idx on public.verification_documents (review_status);

-- 4. Fleet belongs to the company --------------------------------------------

alter table public.boats add column company_id uuid references public.companies(id);
create index boats_company_idx on public.boats (company_id) where not is_deleted;

-- 5. Backfill ----------------------------------------------------------------
-- One company per existing owner profile, named from the business they gave at signup.
-- Their boats, documents and verified status carry across so nobody loses standing.

do $$
declare r record; v_company_id uuid;
begin
  for r in select * from public.profiles where role = 'owner' loop
    insert into public.companies (name, verification_status, created_by, verified_at, verified_by)
    values (
      coalesce(nullif(btrim(r.business_name), ''), nullif(btrim(r.full_name), ''), 'Unnamed operator'),
      case r.verification_status
        when 'verified' then 'verified'::company_verification_status
        when 'rejected' then 'rejected'::company_verification_status
        else 'unverified'::company_verification_status
      end,
      r.id,
      case when r.verification_status = 'verified' then coalesce(r.reviewed_at, now()) end,
      case when r.verification_status = 'verified' then r.reviewed_by end
    )
    returning id into v_company_id;

    insert into public.company_members (company_id, profile_id, member_role)
    values (v_company_id, r.id, 'owner');

    update public.boats set company_id = v_company_id where owner_id = r.id;
    update public.verification_documents set company_id = v_company_id where user_id = r.id;
  end loop;
end $$;

-- 6. New owner signups get a company at the same moment they get a profile ----

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  requested text := coalesce(new.raw_user_meta_data->>'role', 'tourist');
  safe_role user_role;
  v_company_id uuid;
begin
  if requested in ('tourist','owner','hotel','agency') then safe_role := requested::user_role; else safe_role := 'tourist'; end if;

  insert into public.profiles (id, role, full_name, phone, business_name, verification_status)
  values (new.id, safe_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name',
    case when safe_role in ('owner','hotel','agency') then 'pending'::verification_status else 'verified'::verification_status end);

  if safe_role = 'owner' then
    insert into public.companies (name, created_by)
    values (
      coalesce(
        nullif(btrim(new.raw_user_meta_data->>'business_name'), ''),
        nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
        'Unnamed operator'
      ),
      new.id
    )
    returning id into v_company_id;

    insert into public.company_members (company_id, profile_id, member_role)
    values (v_company_id, new.id, 'owner');
  end if;

  return new;
end; $$;

-- 7. Guard the admin-only columns --------------------------------------------
-- Column grants alone would not stop an owner setting their own company verified.

create or replace function public.guard_company_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.verification_status is distinct from old.verification_status
      or new.verification_note is distinct from old.verification_note
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at)
     and not public.is_admin() then
    raise exception 'Only an administrator can change company verification';
  end if;
  new.updated_at := now();
  return new;
end; $$;

create trigger companies_guard_privileges
before update on public.companies
for each row execute function public.guard_company_privileges();

create or replace function public.guard_document_review()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.review_status is distinct from old.review_status
      or new.review_note is distinct from old.review_note
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at)
     and not public.is_admin() then
    raise exception 'Only an administrator can review a document';
  end if;
  return new;
end; $$;

create trigger verification_documents_guard_review
before update on public.verification_documents
for each row execute function public.guard_document_review();

-- 8. Row level security ------------------------------------------------------

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create policy "companies_read_own_or_admin" on public.companies
  for select to authenticated
  using (public.is_company_member(id) or public.is_admin());

create policy "companies_update_own_or_admin" on public.companies
  for update to authenticated
  using (public.is_company_member(id) or public.is_admin())
  with check (public.is_company_member(id) or public.is_admin());

create policy "company_members_read_own_or_admin" on public.company_members
  for select to authenticated
  using (profile_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

revoke all on public.companies from anon;
revoke all on public.company_members from anon;
grant select on public.companies to authenticated;
grant update (name, registration_number, contact_email, contact_phone) on public.companies to authenticated;
grant select on public.company_members to authenticated;

-- Documents: a member may read and upload their company's, an admin sees everything.
drop policy if exists "vdocs_select_own_or_admin" on public.verification_documents;
create policy "vdocs_select_own_or_admin" on public.verification_documents
  for select to authenticated
  using (
    user_id = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_admin()
  );

drop policy if exists "vdocs_insert_own" on public.verification_documents;
create policy "vdocs_insert_own" on public.verification_documents
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (company_id is null or public.is_company_member(company_id))
  );

drop policy if exists "vdocs_delete_own" on public.verification_documents;
create policy "vdocs_delete_own" on public.verification_documents
  for delete to authenticated
  using (
    (user_id = auth.uid() and review_status <> 'approved')
    or public.is_admin()
  );

create policy "vdocs_update_admin_or_owner" on public.verification_documents
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

grant update (doc_kind, expires_at, review_status, review_note, reviewed_by, reviewed_at)
  on public.verification_documents to authenticated;

-- Boats: the tenant, not the individual, decides who may work on a listing.
drop policy if exists "boats_update_own" on public.boats;
create policy "boats_update_own" on public.boats
  for update to authenticated
  using (
    owner_id = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_admin()
  )
  with check (
    owner_id = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_admin()
  );

drop policy if exists "boat_images_write_own" on public.boat_images;
create policy "boat_images_write_own" on public.boat_images
  for all to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_id
                 and (b.owner_id = auth.uid()
                      or (b.company_id is not null and public.is_company_member(b.company_id))
                      or public.is_admin())))
  with check (exists (select 1 from public.boats b where b.id = boat_id
                      and (b.owner_id = auth.uid()
                           or (b.company_id is not null and public.is_company_member(b.company_id))
                           or public.is_admin())));

-- 9. Admin review RPCs -------------------------------------------------------

create or replace function public.admin_review_document(
  p_document_id uuid, p_status text, p_note text default null
) returns public.verification_documents
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_doc public.verification_documents;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_status not in ('pending','approved','rejected') then
    raise exception 'Status must be pending, approved, or rejected';
  end if;
  update public.verification_documents set
    review_status = p_status, review_note = p_note,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_document_id returning * into v_doc;
  if v_doc.id is null then raise exception 'Document not found'; end if;
  return v_doc;
end; $$;

create or replace function public.admin_review_company(
  p_company_id uuid, p_status company_verification_status, p_note text default null
) returns public.companies
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company public.companies; v_approved int;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;

  -- Same spirit as admin_review_account: a company is not verified on an empty file.
  if p_status = 'verified' then
    select count(*) into v_approved from public.verification_documents
      where company_id = p_company_id and review_status = 'approved';
    if v_approved = 0 then
      raise exception 'Approve at least one of this company''s documents before verifying it.';
    end if;
  end if;

  update public.companies set
    verification_status = p_status,
    verification_note = p_note,
    verified_at = case when p_status = 'verified' then now() else null end,
    verified_by = case when p_status = 'verified' then auth.uid() else null end
  where id = p_company_id returning * into v_company;
  if v_company.id is null then raise exception 'Company not found'; end if;
  return v_company;
end; $$;

revoke all on function public.admin_review_document(uuid, text, text) from anon;
revoke all on function public.admin_review_company(uuid, company_verification_status, text) from anon;

-- 10. The tourist-facing badge follows the company ---------------------------

create or replace view public.public_boats as

select
  b.id, b.owner_id, b.name, b.boat_type, b.capacity, b.description, b.location,
  b.price_per_hour, b.price_per_day, b.facilities, b.safety_equipment,
  b.crew_included, b.fuel_policy, b.registration_number,
  b.capacity as max_guests, b.maintenance_status, b.created_at,
  p.business_name as operator_name,
  p.phone as operator_phone,
  coalesce(c.verification_status = 'verified', p.verification_status = 'verified') as operator_verified,
  p.trust_score as operator_trust_score,
  b.deposit_percent
from public.boats b
join public.profiles p on p.id = b.owner_id
left join public.companies c on c.id = b.company_id
where b.status = 'approved'
  and b.is_active
  and not b.is_deleted
  and b.maintenance_status <> 'overdue';

grant select on public.public_boats to anon, authenticated;

-- 11. Audit ------------------------------------------------------------------

create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function public.record_audit();
