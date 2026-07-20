-- Bug in migration 06: propose_boat_changes parks sensitive edits in
-- pending_changes, but the guard_boat_privileges trigger blocks pending_changes
-- writes for non-admins. The RPC runs SECURITY DEFINER as the owner (not admin),
-- so its own write was rejected with "Approval metadata is administrator-only".
-- Wrap the RPC's writes in the same transaction-local bypass flag the hours RPCs
-- use. The owner still cannot change status or approval fields, because the RPC
-- never writes them.
create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
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
end; $$;
