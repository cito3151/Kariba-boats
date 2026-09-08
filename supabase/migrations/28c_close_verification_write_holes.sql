-- Closes write holes left by migration 28. Three root causes, five symptoms.
--
-- Cause A: `grant update (cols)` was issued without first revoking the table-wide
--   UPDATE that Supabase grants `authenticated` by default, so the column lists were
--   no-ops and every column stayed writable. Migration 01 gets this right for
--   profiles (`revoke update ... ; grant update (cols) ...`); 28 did not copy it.
-- Cause B: the guard triggers were BEFORE UPDATE only, so a row could simply be
--   INSERTed already carrying review_status='approved' and a real admin's uuid.
-- Cause C: the guards compared only the review columns, so the file behind an
--   approved document, its kind, and its owning company could all be swapped after
--   approval, and a document could be moved into a company the caller is not in.

-- 1. Take back the blanket grants, then hand back only what the client writes -----

revoke insert, update on public.companies from authenticated;
revoke insert, update on public.verification_documents from authenticated;

-- Companies are created by handle_new_user (security definer), never by the client.
grant update (name, registration_number, contact_email, contact_phone)
  on public.companies to authenticated;

-- The review columns are deliberately absent here: they are written only by
-- admin_review_document, which is security definer.
grant insert (user_id, company_id, doc_kind, storage_path, file_name, label, expires_at)
  on public.verification_documents to authenticated;
grant update (doc_kind, expires_at, label)
  on public.verification_documents to authenticated;

-- 2. Guard documents on INSERT as well as UPDATE ---------------------------------

create or replace function public.guard_document_review()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- No end user in context means a trusted server caller: the service role, a
  -- migration, or seeding. Those bypass RLS but still fire triggers, so they must
  -- pass through. Anonymous requests cannot reach here: anon holds no insert or
  -- update grant on these tables and no policy admits it.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_admin() then
      -- A document always enters the queue unreviewed, whatever the client sent.
      new.review_status := 'pending';
      new.review_note := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
    if new.company_id is not null
       and not (public.is_company_member(new.company_id) or public.is_admin()) then
      raise exception 'You cannot file a document against another company';
    end if;
    return new;
  end if;

  if not public.is_admin() then
    if new.review_status is distinct from old.review_status
       or new.review_note is distinct from old.review_note
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Only an administrator can review a document';
    end if;

    -- An approval refers to a specific file. Freeze what it refers to, so the
    -- approved bytes cannot be swapped for something else afterwards.
    if old.review_status = 'approved'
       and (new.storage_path is distinct from old.storage_path
            or new.file_name is distinct from old.file_name
            or new.doc_kind is distinct from old.doc_kind
            or new.company_id is distinct from old.company_id
            or new.expires_at is distinct from old.expires_at) then
      raise exception 'An approved document cannot be altered. Upload a replacement instead.';
    end if;

    -- Blocked on INSERT above; block the two-step move as well.
    if new.company_id is distinct from old.company_id
       and new.company_id is not null
       and not public.is_company_member(new.company_id) then
      raise exception 'You cannot move a document into another company';
    end if;

    if new.user_id is distinct from old.user_id then
      raise exception 'A document cannot be reassigned to another user';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists verification_documents_guard_review on public.verification_documents;
create trigger verification_documents_guard_review
before insert or update on public.verification_documents
for each row execute function public.guard_document_review();

-- 3. Guard companies on INSERT as well, and freeze provenance ---------------------

create or replace function public.guard_company_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- No end user in context means a trusted server caller: the service role, a
  -- migration, or seeding. Those bypass RLS but still fire triggers, so they must
  -- pass through. Anonymous requests cannot reach here: anon holds no insert or
  -- update grant on these tables and no policy admits it.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.verification_status := 'unverified';
      new.verification_note := null;
      new.verified_at := null;
      new.verified_by := null;
    end if;
    return new;
  end if;

  if not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       or new.verification_note is distinct from old.verification_note
       or new.verified_by is distinct from old.verified_by
       or new.verified_at is distinct from old.verified_at then
      raise exception 'Only an administrator can change company verification';
    end if;
    if new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Company provenance cannot be rewritten';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists companies_guard_privileges on public.companies;
create trigger companies_guard_privileges
before insert or update on public.companies
for each row execute function public.guard_company_privileges();

-- 4. Stop the verified badge being laundered through boats.company_id -------------
-- public_boats.operator_verified reads through boats.company_id, and that column is
-- publicly readable, so without this an owner could point their boats at any
-- verified company's uuid and inherit its badge.

create or replace function public.guard_boat_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Set only inside log_operating_hours() / complete_maintenance(). Direct client
  -- updates never set it, so protected columns stay locked for them.
  if coalesce(current_setting('app.boat_hours_ctx', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if not public.is_admin() then
    if new.status is distinct from old.status
       and not (old.status in ('draft','rejected') and new.status = 'pending') then
      raise exception 'Owners may only submit a boat for review. Approval is an administrator action.';
    end if;
    if new.accumulated_hours is distinct from old.accumulated_hours then
      raise exception 'Operating hours must be logged through log_operating_hours()';
    end if;
    if new.last_maintenance_hours is distinct from old.last_maintenance_hours then
      raise exception 'Maintenance resets must go through complete_maintenance()';
    end if;
    if new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by
       or new.pending_changes is distinct from old.pending_changes then
      raise exception 'Approval metadata is administrator-only';
    end if;
    if new.company_id is distinct from old.company_id then
      raise exception 'A boat cannot be moved between companies';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- 5. New boats join the creator's company ----------------------------------------
-- Migration 28 backfilled existing boats but added no default, so every boat created
-- after it had company_id null: invisible to company-member policies, and its badge
-- silently fell back to the profile.

create or replace function public.stamp_boat_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.company_id is null then
    new.company_id := (
      select company_id from public.company_members
      where profile_id = coalesce(new.owner_id, auth.uid())
      order by added_at
      limit 1
    );
  elsif not (public.is_company_member(new.company_id) or public.is_admin()) then
    raise exception 'You cannot create a boat for another company';
  end if;
  return new;
end; $$;

drop trigger if exists boats_stamp_company on public.boats;
create trigger boats_stamp_company
before insert on public.boats
for each row execute function public.stamp_boat_company();

-- 6. Make the multi-company helper deterministic ---------------------------------
-- The whole point of the tenant model is that a profile may belong to more than one
-- company; `limit 1` with no ordering returned a server-chosen row.

create or replace function public.current_user_company()
returns uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select company_id from public.company_members
  where profile_id = auth.uid()
  order by added_at, company_id
  limit 1;
$$;

revoke all on function public.current_user_company() from public, anon;
grant execute on function public.current_user_company() to authenticated;
