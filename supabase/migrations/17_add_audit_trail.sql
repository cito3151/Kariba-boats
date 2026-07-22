-- Append-only audit trail. A generic record_audit() trigger writes to audit_log
-- on every insert/update/delete of the core domain tables, capturing the actor,
-- the operation, a human label, and a diff (full snapshot on insert/delete;
-- changed-fields old->new on update, excluding updated_at). Deletions leave a
-- full before-image, so nothing is lost to history. Admins read via
-- admin_list_audit; the table has no client write/edit policy (only the
-- SECURITY DEFINER trigger inserts), so the trail cannot be altered through the API.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null check (action in ('insert','update','delete')),
  entity_type text not null,
  entity_id uuid,
  label text,
  changed jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, created_at desc);

alter table public.audit_log enable row level security;
create policy "audit_log_read_admin" on public.audit_log
  for select to authenticated using (public.is_admin());
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.record_audit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_changed jsonb;
  v_entity uuid;
  v_label text;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('old', v_old->key, 'new', v_new->key))
      into v_changed
    from (
      select key from jsonb_object_keys(v_new) as t(key)
      where key <> 'updated_at' and (v_old->key) is distinct from (v_new->key)
    ) diffs;
    if v_changed is null then return new; end if;
  elsif tg_op = 'INSERT' then
    v_changed := v_new;
  else
    v_changed := v_old;
  end if;

  v_entity := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  v_label := coalesce(v_new->>'name', v_old->>'name', v_new->>'guest_name', v_old->>'guest_name',
                      v_new->>'full_name', v_old->>'full_name');

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, label, changed)
  values (
    auth.uid(),
    (select role::text from public.profiles where id = auth.uid()),
    lower(tg_op), tg_table_name, v_entity, v_label, v_changed
  );
  return coalesce(new, old);
end; $$;

create trigger audit_boats after insert or update or delete on public.boats
  for each row execute function public.record_audit();
create trigger audit_bookings after insert or update or delete on public.bookings
  for each row execute function public.record_audit();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.record_audit();
create trigger audit_boat_images after insert or update or delete on public.boat_images
  for each row execute function public.record_audit();
create trigger audit_reviews after insert or update or delete on public.reviews
  for each row execute function public.record_audit();
create trigger audit_hotels after insert or update or delete on public.hotels
  for each row execute function public.record_audit();

create or replace function public.admin_list_audit(
  p_entity_type text default null, p_action text default null, p_limit int default 100
) returns table(id uuid, created_at timestamptz, actor_id uuid, actor_email text, actor_name text,
                actor_role text, action text, entity_type text, entity_id uuid, label text, changed jsonb)
language plpgsql security definer set search_path = public, pg_temp, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  return query
    select a.id, a.created_at, a.actor_id, u.email::text, p.full_name, a.actor_role,
           a.action, a.entity_type, a.entity_id, a.label, a.changed
    from public.audit_log a
    left join auth.users u on u.id = a.actor_id
    left join public.profiles p on p.id = a.actor_id
    where (p_entity_type is null or a.entity_type = p_entity_type)
      and (p_action is null or a.action = p_action)
    order by a.created_at desc
    limit least(coalesce(p_limit, 100), 500);
end; $$;

revoke all on function public.admin_list_audit(text, text, int) from public, anon;
grant execute on function public.admin_list_audit(text, text, int) to authenticated;
