create table public.admin_approval_logs (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid references public.boats(id) on delete set null,
  admin_id uuid not null references public.profiles(id),
  action text not null check (action in
    ('approve','reject','suspend','unsuspend','approve_changes','reject_changes','hard_delete')),
  reason text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index approval_logs_boat_idx on public.admin_approval_logs (boat_id, created_at desc);

alter table public.admin_approval_logs enable row level security;
create policy "approval_logs_read" on public.admin_approval_logs
  for select to authenticated
  using (public.is_admin()
         or exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid()));

-- The single definition of a sensitive field. Client and server cannot drift.
create or replace function public.is_sensitive_change(p_changes jsonb)
returns boolean language sql immutable as $$
  select exists (
    select 1 from jsonb_object_keys(p_changes) k
    where k in ('name','boat_type','capacity','price_per_hour','price_per_day',
                'safety_equipment','crew_included','registration_number')
  );
$$;

create or replace function public.submit_boat_for_review(p_boat_id uuid)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;
  if v_boat.status not in ('draft','rejected') then
    raise exception 'Only a draft or rejected boat can be submitted for review';
  end if;
  if not exists (select 1 from public.boat_images where boat_id = p_boat_id) then
    raise exception 'Add at least one photo before submitting for review';
  end if;

  update public.boats set status = 'pending', rejection_reason = null
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $$;

-- Sensitive edits park in pending_changes so the live listing keeps its approved
-- values. Non-sensitive edits apply straight away.
create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;

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
  return v_boat;
end; $$;

create or replace function public.admin_review_boat(
  p_boat_id uuid, p_action text, p_reason text default null
) returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;

  if p_action = 'approve' then
    update public.boats set status = 'approved', approved_at = now(),
      approved_by = auth.uid(), rejection_reason = null
    where id = p_boat_id returning * into v_boat;
    update public.boat_images set moderation_status = 'approved'
    where boat_id = p_boat_id and moderation_status = 'pending';
  elsif p_action = 'reject' then
    if p_reason is null or length(btrim(p_reason)) < 5 then
      raise exception 'A rejection must include a reason of at least 5 characters';
    end if;
    update public.boats set status = 'rejected', rejection_reason = p_reason
    where id = p_boat_id returning * into v_boat;
  elsif p_action = 'suspend' then
    update public.boats set status = 'suspended', rejection_reason = p_reason
    where id = p_boat_id returning * into v_boat;
  elsif p_action = 'unsuspend' then
    update public.boats set status = 'approved', rejection_reason = null
    where id = p_boat_id returning * into v_boat;
  else
    raise exception 'Unknown action: %', p_action;
  end if;

  insert into public.admin_approval_logs (boat_id, admin_id, action, reason, snapshot)
  values (p_boat_id, auth.uid(), p_action, p_reason, to_jsonb(v_boat));
  return v_boat;
end; $$;

create or replace function public.admin_review_changes(
  p_boat_id uuid, p_approve boolean, p_reason text default null
) returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats; v_changes jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  v_changes := v_boat.pending_changes;
  if v_changes is null then raise exception 'This boat has no pending changes'; end if;

  if p_approve then
    update public.boats set
      name = coalesce(v_changes->>'name', name),
      boat_type = coalesce((v_changes->>'boat_type')::boat_kind, boat_type),
      capacity = coalesce((v_changes->>'capacity')::int, capacity),
      price_per_hour = coalesce((v_changes->>'price_per_hour')::numeric, price_per_hour),
      price_per_day = coalesce((v_changes->>'price_per_day')::numeric, price_per_day),
      safety_equipment = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(v_changes->'safety_equipment')),
        safety_equipment),
      crew_included = coalesce((v_changes->>'crew_included')::boolean, crew_included),
      registration_number = coalesce(v_changes->>'registration_number', registration_number),
      pending_changes = null
    where id = p_boat_id returning * into v_boat;
  else
    update public.boats set pending_changes = null, rejection_reason = p_reason
    where id = p_boat_id returning * into v_boat;
  end if;

  insert into public.admin_approval_logs (boat_id, admin_id, action, reason, snapshot)
  values (p_boat_id, auth.uid(),
          case when p_approve then 'approve_changes' else 'reject_changes' end,
          p_reason, v_changes);
  return v_boat;
end; $$;

-- Soft delete is refused while future bookings exist. The error names the count.
create or replace function public.soft_delete_boat(p_boat_id uuid)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats; v_active int;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not your boat';
  end if;

  select count(*) into v_active from public.bookings
  where boat_id = p_boat_id
    and status in ('requested','confirmed','deposit_paid')
    and start_date >= current_date;

  if v_active > 0 then
    raise exception 'This boat has % upcoming booking(s). Cancel or complete them before deleting, or set the boat to unavailable instead.', v_active;
  end if;

  update public.boats set is_deleted = true, deleted_at = now(), is_active = false
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $$;

revoke all on function public.admin_review_boat(uuid, text, text) from public, anon;
revoke all on function public.admin_review_changes(uuid, boolean, text) from public, anon;
grant execute on function public.submit_boat_for_review(uuid) to authenticated;
grant execute on function public.propose_boat_changes(uuid, jsonb) to authenticated;
grant execute on function public.admin_review_boat(uuid, text, text) to authenticated;
grant execute on function public.admin_review_changes(uuid, boolean, text) to authenticated;
grant execute on function public.soft_delete_boat(uuid) to authenticated;
