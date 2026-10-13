-- Verification has to keep up with its own evidence.
--
-- 28d closed the gate at the moment of verifying: an admin cannot mark a company
-- verified without an approved document of every kind in company_document_kind.
-- Nothing ever looked at that rule again afterwards, so three separate paths each
-- left a verified badge standing on proof the company no longer has.
--
-- Cause A: evidence can be withdrawn after the fact. An admin flips a previously
--   approved document to 'rejected' through admin_review_document, or deletes the
--   row outright, and companies.verification_status stays 'verified'. Tourists keep
--   seeing public_boats.operator_verified for an operator whose proof is gone.
-- Cause B: expires_at was schema only. Spec 3.3 promises "verification does not
--   expire silently", but no gate, view or RPC read the column, so a company
--   verified on an operator licence that lapsed last year still reads as verified.
-- Cause C: vdocs_delete_own (28) refuses to delete an approved ROW, but migration
--   23's regdocs_delete_own has no such condition, so the same user can delete the
--   FILE straight through the storage API. The approved row survives pointing at a
--   dead path and the admin's signed-URL review 404s: the row says "proof on file",
--   the bucket says otherwise.
--
-- What this migration deliberately does NOT do: revalidate every company on apply.
-- The live database holds one company, verified, with zero verification_documents --
-- grandfathered by 28's backfill, which carried profiles.verification_status across
-- before typed proofs existed. A blanket "revalidate everything" step would strip a
-- real operator's badge as a side effect of a schema migration, which is a product
-- decision and not a migration's to take. Every downgrade below is triggered either
-- by evidence that actually changes, or by an admin explicitly running the expiry
-- sweep. Applying this file changes no existing row.

-- 1. Where a withdrawn verification is recorded ---------------------------------
-- An automatic downgrade has to say why it happened. verification_note is the
-- reviewing admin's own words and must survive, so the machine writes here instead.

alter table public.companies
  add column if not exists verification_lapsed_at timestamptz,
  add column if not exists verification_lapse_reason text;

comment on column public.companies.verification_lapsed_at is
  'When verification was last withdrawn because its supporting documents stopped satisfying the requirement. Null if that has never happened.';
comment on column public.companies.verification_lapse_reason is
  'Machine-written explanation of that withdrawal, listing the proofs left outstanding. verification_note stays exactly as the reviewing admin wrote it.';

-- No grant is issued for these two columns on purpose. 28c revoked the table-wide
-- UPDATE from `authenticated` and hands back only name, registration_number,
-- contact_email and contact_phone, so a new column is unwritable by the client
-- unless someone deliberately grants it. Nothing here does.

-- 2. The requirement, stated once ----------------------------------------------
-- 28d spelled the rule out inline inside admin_review_company. Three call sites now
-- need the same answer (the gate, the document trigger, the expiry sweep), and a
-- rule that is copied three times is a rule that will drift. It lives here instead,
-- and it now folds in expiry: a lapsed licence is not proof of anything.

create or replace function public.company_missing_proofs(p_company_id uuid)
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(k::text order by k::text), array[]::text[])
  from unnest(enum_range(null::company_document_kind)) k
  where not exists (
    select 1 from public.verification_documents d
     where d.company_id = p_company_id
       and d.doc_kind = k
       and d.review_status = 'approved'
       -- expires_at is a date. A document expiring today is still valid today; it
       -- stops counting the day after. Null means "does not expire", which is the
       -- right default for a certificate of incorporation.
       and (d.expires_at is null or d.expires_at >= current_date)
  );
$$;

-- Client-unreachable on purpose: no role holds EXECUTE, not even `authenticated`.
-- Postgres grants EXECUTE to PUBLIC by default and `revoke ... from anon` alone does
-- not undo that -- the mistake 28b exists to fix -- so PUBLIC is revoked explicitly.
-- The security definer functions below call it as the function owner, which needs no
-- grant. Granting it would let any signed-in user probe which proofs any company id
-- is short of.
revoke all on function public.company_missing_proofs(uuid) from public, anon, authenticated;

-- 3. Withdrawing a verification, honestly ---------------------------------------
--
-- Why the target status is 'pending' and not 'unverified':
--   'unverified' claims the company never applied, which is a lie about a company an
--   admin did verify, and it drops the operator out of the admin's queue entirely.
--   'rejected' claims an admin judged the proof bad, which is not what happened
--   either. 'pending' is the truthful state and the one spec 3.3 asks for: the badge
--   is off (public_boats compares against 'verified'), and the company is sitting in
--   front of an admin again rather than quietly keeping a badge it no longer earns.
-- Why verification_note is left untouched:
--   it is the reviewing admin's own account of the decision. Overwriting it would
--   destroy the audit story this migration exists to protect.
-- Why verified_at / verified_by are nulled:
--   they read "verified since / verified by", present tense, and a company that is
--   not verified has no such pair. Nothing is lost: the record_audit trigger on
--   companies writes an old -> new diff for every column this update touches, so who
--   verified the company and when stays in audit_log, alongside the row that records
--   the document change that caused this.
-- The function never promotes, only demotes. Verification is an admin's judgement;
-- re-uploading a document must not hand a badge back automatically.

create or replace function public.revalidate_company_verification(
  p_company_id uuid, p_reason text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status company_verification_status;
  v_missing text[];
begin
  if p_company_id is null then return false; end if;

  -- for update: two admins rejecting two documents at once must not race each other
  -- into two conflicting decisions about the same company.
  select verification_status into v_status
    from public.companies where id = p_company_id for update;
  if v_status is distinct from 'verified' then return false; end if;

  v_missing := public.company_missing_proofs(p_company_id);
  if cardinality(v_missing) = 0 then return false; end if;

  perform set_config('app.company_verification_ctx', 'on', true);
  update public.companies set
    verification_status = 'pending',
    verified_at = null,
    verified_by = null,
    verification_lapsed_at = now(),
    verification_lapse_reason =
      p_reason || ' Outstanding proofs: ' || array_to_string(v_missing, ', ') || '.'
  where id = p_company_id;
  perform set_config('app.company_verification_ctx', 'off', true);

  return true;
end; $$;

revoke all on function public.revalidate_company_verification(uuid, text)
  from public, anon, authenticated;

-- 4. Let that one path past the privilege guard ---------------------------------
-- Identical to 28c except for the context check at the top. Without it the guard
-- raises 'Only an administrator can change company verification' from inside the
-- downgrade, which would abort the admin's document rejection with a nonsense error
-- -- and would make the expiry sweep unrunnable by a scheduler, which has no admin
-- profile behind it at all.

create or replace function public.guard_company_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Set only inside revalidate_company_verification(), the single code path allowed
  -- to withdraw a badge without an admin in the session. set_config's third argument
  -- is true, so the flag is transaction local and cannot leak into a later request on
  -- the same pooled connection, and it is cleared again the moment the update
  -- returns. No client can raise it: set_config lives in pg_catalog, which PostgREST
  -- does not expose. Same shape as app.boat_hours_ctx in guard_boat_privileges.
  if coalesce(current_setting('app.company_verification_ctx', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;

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
    -- The lapse record is written by revalidate_company_verification and by nobody
    -- else. There is no column grant for it, so this is belt and braces against a
    -- future grant quietly reopening the hole.
    if new.verification_lapsed_at is distinct from old.verification_lapsed_at
       or new.verification_lapse_reason is distinct from old.verification_lapse_reason then
      raise exception 'Only an administrator can change company verification';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- The trigger itself is unchanged; recreated only so this file is self-describing.
drop trigger if exists companies_guard_privileges on public.companies;
create trigger companies_guard_privileges
before insert or update on public.companies
for each row execute function public.guard_company_privileges();

-- 5. Cause A: react when a proof is actually withdrawn ---------------------------
-- The trigger fires only when a document that WAS counting toward the requirement
-- stops counting. That distinction matters on this database: the one live company is
-- verified with zero documents, so a blunt "revalidate on any document write" would
-- knock its badge off the moment its owner uploaded their first proof -- punishing
-- exactly the behaviour the platform wants. An INSERT can never remove evidence, so
-- the trigger does not listen for one.

create or replace function public.revalidate_company_after_document_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Defensive: OLD is unassigned on INSERT and SQL's AND does not promise to
  -- short-circuit, so an INSERT must leave before any OLD field is read.
  if tg_op = 'INSERT' then return null; end if;

  if not (old.review_status = 'approved'
          and old.doc_kind is not null
          and old.company_id is not null
          and (old.expires_at is null or old.expires_at >= current_date)) then
    return null;  -- was not part of the proof set; nothing can have been withdrawn
  end if;

  if tg_op = 'UPDATE' then
    if new.review_status = 'approved'
       and new.doc_kind is not distinct from old.doc_kind
       and new.company_id is not distinct from old.company_id
       and (new.expires_at is null or new.expires_at >= current_date) then
      return null;  -- still the same proof, still approved, still current
    end if;
  end if;

  perform public.revalidate_company_verification(
    old.company_id,
    case tg_op
      when 'DELETE' then 'A document supporting this verification was deleted.'
      else 'A document supporting this verification stopped counting as proof.'
    end);
  return null;
end; $$;

-- A trigger function cannot be called as a function, but it still carries Postgres's
-- default EXECUTE-to-PUBLIC grant and shows up in the security advisors. Nothing
-- should hold EXECUTE on it; the trigger machinery does not need a grant.
revoke all on function public.revalidate_company_after_document_change()
  from public, anon, authenticated;

drop trigger if exists verification_documents_revalidate_company on public.verification_documents;
-- Named to sort after audit_verification_documents, so the audit_log reads in causal
-- order: the document change first, then the company downgrade it caused.
create trigger verification_documents_revalidate_company
after update or delete on public.verification_documents
for each row execute function public.revalidate_company_after_document_change();

-- 6. Cause B: make expires_at mean something ------------------------------------
--
-- Expiry is the one trigger that never fires: no row is written when a licence
-- crosses midnight. Three answers, and the choice between them is the honest part.
--
-- Rejected: recomputing the badge at read time inside public_boats. It would be
--   silent -- no audit_log row, no note, no admin ever told -- which is precisely
--   what spec 3.3 forbids, and it would make the tourist-facing view join the
--   document table on every anonymous browse.
-- Rejected: scheduling a job in this migration. Whether to run a sweep on a timer
--   (pg_cron, or an edge function holding the service role) is a deployment choice,
--   and creating an extension and a job that mutates live rows is not something a
--   schema migration should do behind the operator's back. The sweep below is
--   written so a scheduler can call it later without any change here.
-- Chosen: expiry is enforced everywhere a decision is actually taken -- an expired
--   document cannot be verified on (section 7) and cannot hold up an existing
--   verification (section 5) -- and it is surfaced to the admin, who converts it
--   into a real, audited downgrade with one call. So the badge survives at most
--   until the next admin sweep, and when it goes it goes on the record with a reason
--   attached, rather than evaporating overnight with no trace of why.

create or replace function public.admin_list_verification_expiry(p_within_days int default 30)
returns table (
  company_id uuid,
  company_name text,
  verification_status company_verification_status,
  document_id uuid,
  doc_kind company_document_kind,
  file_name text,
  expires_at date,
  days_remaining int,
  expiry_state text,
  outstanding_proofs text[]
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  return query
    select c.id, c.name, c.verification_status, d.id, d.doc_kind, d.file_name, d.expires_at,
           (d.expires_at - current_date)::int,
           case when d.expires_at < current_date then 'expired' else 'expiring' end,
           public.company_missing_proofs(c.id)
      from public.verification_documents d
      join public.companies c on c.id = d.company_id
     where d.review_status = 'approved'
       and d.expires_at is not null
       and d.expires_at <= current_date + greatest(coalesce(p_within_days, 30), 0)
     order by d.expires_at, c.name, d.doc_kind;
end; $$;

revoke all on function public.admin_list_verification_expiry(int) from public, anon;
grant execute on function public.admin_list_verification_expiry(int) to authenticated;

-- The sweep. Idempotent, and narrow on purpose: it considers only companies that
-- hold an approved document which has actually expired. A company that never had
-- documents -- the one grandfathered row on this database -- is not selected, so
-- running this today downgrades nothing. A company whose lapsed licence has already
-- been replaced by a current approved one is selected but not downgraded, because
-- company_missing_proofs comes back empty.
create or replace function public.admin_sweep_expired_verifications()
returns table (company_id uuid, company_name text, outstanding_proofs text[])
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  -- auth.uid() null means a trusted server caller: the service role behind a
  -- scheduled edge function, or a migration. Same exemption 28c's guards make, and
  -- the reason this is callable on a schedule at all.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Administrator only';
  end if;

  for r in
    select distinct c.id, c.name
      from public.companies c
      join public.verification_documents d on d.company_id = c.id
     where c.verification_status = 'verified'
       and d.review_status = 'approved'
       and d.expires_at is not null
       and d.expires_at < current_date
     order by c.name
  loop
    if public.revalidate_company_verification(
         r.id, 'A document supporting this verification expired.') then
      company_id := r.id;
      company_name := r.name;
      outstanding_proofs := public.company_missing_proofs(r.id);
      return next;
    end if;
  end loop;
end; $$;

revoke all on function public.admin_sweep_expired_verifications() from public, anon;
grant execute on function public.admin_sweep_expired_verifications() to authenticated, service_role;

-- 7. The gate now reads the same rule -------------------------------------------
-- Same shape as 28d, with the inline rule replaced by company_missing_proofs, which
-- adds expiry. An admin can no longer verify a company on a licence that has already
-- lapsed -- previously the gate saw review_status = 'approved' and asked nothing
-- else. A successful verification also clears the lapse record, because the lapse is
-- resolved; audit_log keeps the history of it.

create or replace function public.admin_review_company(
  p_company_id uuid, p_status company_verification_status, p_note text default null
) returns public.companies
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company public.companies; v_missing text[];
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;

  if p_status = 'verified' then
    v_missing := public.company_missing_proofs(p_company_id);
    if cardinality(v_missing) > 0 then
      raise exception 'Approve every ownership proof first, and an expired document does not count. Still outstanding: %',
        array_to_string(v_missing, ', ');
    end if;
  end if;

  update public.companies set
    verification_status = p_status,
    verification_note = p_note,
    verified_at = case when p_status = 'verified' then now() else null end,
    verified_by = case when p_status = 'verified' then auth.uid() else null end,
    verification_lapsed_at = case when p_status = 'verified' then null else verification_lapsed_at end,
    verification_lapse_reason = case when p_status = 'verified' then null else verification_lapse_reason end
  where id = p_company_id returning * into v_company;
  if v_company.id is null then raise exception 'Company not found'; end if;
  return v_company;
end; $$;

revoke all on function public.admin_review_company(uuid, company_verification_status, text)
  from public, anon;
grant execute on function public.admin_review_company(uuid, company_verification_status, text)
  to authenticated;

-- 8. Cause C: an approved proof's file is as frozen as its row -------------------
-- 28 froze the row (vdocs_delete_own refuses an approved one, and 28c's guard
-- refuses to let the storage_path behind it be swapped). The bucket never got the
-- same treatment, so the bytes could be deleted while the row still claimed them.
--
-- The correlation is by storage.objects.name against verification_documents
-- .storage_path. Both services write the path as `{auth.uid()}/{uuid}.{ext}` and
-- upload it under that exact key, so objects.name and storage_path are the same
-- string -- no bucket prefix on either side.
--
-- This closes DELETE only, which is the whole hole: the bucket has no UPDATE policy,
-- so overwriting an approved file in place through an upsert is already refused.

create index if not exists verification_documents_storage_path_idx
  on public.verification_documents (storage_path);

create or replace function public.registration_object_is_approved_proof(p_object_name text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.verification_documents d
     where d.storage_path = p_object_name
       and d.review_status = 'approved'
  );
$$;

-- security definer, not a bare subquery in the policy: verification_documents has
-- RLS, and a subquery inside a policy is evaluated under the caller's own row
-- visibility. A row the caller cannot see would come back as "no approved document
-- here" and the delete would be allowed -- failure in exactly the wrong direction.
-- As definer the check is authoritative whoever asks.
--
-- The policy expression runs as the caller, so `authenticated` needs EXECUTE. PUBLIC
-- is revoked first for the 28b reason: revoking anon alone leaves Postgres's default
-- PUBLIC grant in place.
revoke all on function public.registration_object_is_approved_proof(text) from public, anon;
grant execute on function public.registration_object_is_approved_proof(text) to authenticated;

drop policy if exists "regdocs_delete_own" on storage.objects;
create policy "regdocs_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'registration-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.registration_object_is_approved_proof(name)
  );

-- The legitimate client flow is unharmed. documentStorage.service.ts deletes the
-- row first and the object second: for an unapproved document the row delete
-- succeeds and the object is then no longer referenced by any approved row, so this
-- policy lets it go. For an approved one the row delete already fails and the client
-- stops before touching storage. Only the direct storage API call -- the one that
-- skipped the row entirely -- is refused now.
