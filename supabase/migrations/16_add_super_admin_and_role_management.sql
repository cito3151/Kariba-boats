-- Admin and role management. Adds an is_super_admin flag on top of the admin
-- role. Only a super-admin can change roles or grant/revoke admin, via
-- admin_set_role (with a guard that the last super-admin can never be removed).
-- admin_list_users exposes emails (joined from auth.users) to super-admins for
-- the promote-by-email flow. Regular admins keep verification/oversight only.

alter table public.profiles add column is_super_admin boolean not null default false;

-- Bootstrap the founding super-admin (the existing admin).
update public.profiles set is_super_admin = true where role = 'admin';

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;

-- Role and super-admin changes require super-admin; other privileged columns stay at is_admin().
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role or new.is_super_admin is distinct from old.is_super_admin)
     and not public.is_super_admin() then
    raise exception 'Only a super administrator can change roles';
  end if;
  if (new.verification_status is distinct from old.verification_status
      or new.trust_score is distinct from old.trust_score
      or new.verification_note is distinct from old.verification_note
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.hotel_id is distinct from old.hotel_id)
     and not public.is_admin() then
    raise exception 'Only an administrator can change verification or hotel link';
  end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.admin_set_role(
  p_user_id uuid, p_role user_role, p_is_super_admin boolean default false
) returns public.profiles language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile public.profiles; v_target_is_super boolean; v_super_count int;
begin
  if not public.is_super_admin() then raise exception 'Super administrator only'; end if;
  -- Normalize: super-admin implies admin; a non-admin role cannot be super-admin.
  if p_is_super_admin then p_role := 'admin'; end if;
  if p_role <> 'admin' then p_is_super_admin := false; end if;

  select is_super_admin into v_target_is_super from public.profiles where id = p_user_id;
  if v_target_is_super is null then raise exception 'User not found'; end if;

  if v_target_is_super and not p_is_super_admin then
    select count(*) into v_super_count from public.profiles where is_super_admin;
    if v_super_count <= 1 then raise exception 'You cannot remove the last super administrator.'; end if;
  end if;

  update public.profiles set role = p_role, is_super_admin = p_is_super_admin
  where id = p_user_id returning * into v_profile;
  return v_profile;
end; $$;

create or replace function public.admin_list_users()
returns table(id uuid, email text, full_name text, role user_role,
              is_super_admin boolean, verification_status verification_status, created_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp, auth as $$
begin
  if not public.is_super_admin() then raise exception 'Super administrator only'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.is_super_admin, p.verification_status, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end; $$;

revoke all on function public.admin_set_role(uuid, user_role, boolean) from public, anon;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_set_role(uuid, user_role, boolean) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
