-- Follow-up to migration 18: the consent read functions take a target-user id
-- and were granted to authenticated without an authorization check, allowing any
-- signed-in user to probe another user's outstanding consents. Add a self-or-admin
-- guard, matching the convention used by the admin_* functions in migrations 15/16.

create or replace function public.outstanding_consents(p_user uuid default auth.uid())
returns table(doc_type public.legal_doc_type, version int, title text, body text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  if p_user <> auth.uid() and not public.is_admin() then
    raise exception 'Not allowed';
  end if;
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

create or replace function public.has_outstanding_required_consent(p_user uuid default auth.uid())
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user <> auth.uid() and not public.is_admin() then
    raise exception 'Not allowed';
  end if;
  return exists (select 1 from public.outstanding_consents(p_user));
end; $$;
