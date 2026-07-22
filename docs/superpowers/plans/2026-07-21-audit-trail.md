# Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An append-only audit log records every create/update/delete on the core domain tables (with actor and before/after), readable by admins.

**Architecture:** A generic `record_audit()` trigger writes to `audit_log` on the six domain tables; deletes store a full before-image. Admins read via `admin_list_audit`. The table is append-only (no client write/edit policy).

**Tech Stack:** Supabase (Postgres 17), supabase-js v2, React 19, TypeScript, Vite.

## Global Constraints

- Project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz`.
- Migration applied via MCP AND saved to `supabase/migrations/17_add_audit_trail.sql`.
- Commit each task with `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo` (use PowerShell for git in this session; bash git has been hanging).
- No em dashes. After migration, `get_advisors type: security` zero ERROR.

---

## Task 1: Audit table, trigger, and read RPC (migration 17)

**Files:** Migration `add_audit_trail`; save `supabase/migrations/17_add_audit_trail.sql`.

**Interfaces produced:** `public.audit_log`; `record_audit()` trigger on boats/bookings/profiles/boat_images/reviews/hotels; `admin_list_audit(text, text, int)`.

- [ ] **Step 1: Apply the migration**

```sql
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
```

- [ ] **Step 2: Verify** with `execute_sql`:
```sql
select tgname from pg_trigger where tgname like 'audit_%' order by tgname;
select count(*) as audit_rows from public.audit_log;
```
Expected: six `audit_*` triggers. audit_rows may already be > 0 from the migration touching profiles (it does not; expect 0 unless other writes occurred).

- [ ] **Step 3: Quick behavioural check** with `execute_sql` (runs as service, auth.uid() null):
```sql
insert into public.hotels (name, location, commission_rate, is_verified) values ('Audit Probe', 'Kariba', 8, false);
update public.hotels set commission_rate = 9 where name = 'Audit Probe';
delete from public.hotels where name = 'Audit Probe';
select action, entity_type, label, changed from public.audit_log where entity_type = 'hotels' order by created_at desc limit 3;
```
Expected: three rows (delete/update/insert) for label 'Audit Probe'; update row's `changed` has commission_rate old 8 new 9; delete row's `changed` is the full snapshot. Then clean the probe audit rows: `delete from public.audit_log where label = 'Audit Probe';` (allowed via SQL/service, not via API).

- [ ] **Step 4: Save** identical SQL (Steps 1 only) to `supabase/migrations/17_add_audit_trail.sql` with a leading comment.

- [ ] **Step 5: Commit** (PowerShell)
```
git -C "C:\Users\paulo\kariba-boats" -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -am "Add append-only audit log with triggers and admin read RPC"
```

---

## Task 2: Types and audit service

**Files:** Modify `src/types/database.ts` (regenerated); create `src/services/audit.service.ts`.

- [ ] **Step 1: Regenerate types** via `generate_typescript_types`, write to `src/types/database.ts`.

- [ ] **Step 2: audit.service.ts**

```ts
import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface AuditEntry {
  id: string; createdAt: string;
  actorEmail: string | null; actorName: string | null; actorRole: string | null;
  action: 'insert' | 'update' | 'delete';
  entityType: string; entityId: string | null; label: string | null;
  changed: Record<string, unknown> | null;
}

export async function listAudit(opts: { entityType?: string; action?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_audit', {
    p_entity_type: opts.entityType ?? undefined,
    p_action: opts.action ?? undefined,
    p_limit: opts.limit ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => ({
    id: r.id, createdAt: r.created_at, actorEmail: r.actor_email, actorName: r.actor_name,
    actorRole: r.actor_role, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    label: r.label, changed: r.changed,
  }));
}
```

- [ ] **Step 3: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 4: Commit** (PowerShell)
```
git -C "C:\Users\paulo\kariba-boats" -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -am "Add audit types and audit service"
```

---

## Task 3: Activity log UI

**Files:** Create `src/components/admin/AuditLog.tsx`; modify `src/pages/AdminDashboard.tsx`.

- [ ] **Step 1: AuditLog component**

Loads `useAsync(() => listAudit({ entityType, action }), [entityType, action])` with two `<select>` filters:
- entity type: all / boats / bookings / profiles / boat_images / reviews / hotels
- action: all / insert / update / delete

Each row: `createdAt` (localized), actor (`actorEmail` or "system"), an action chip (insert lake, update amber, delete red), `entityType` + `label`, and a details toggle rendering `changed`: for updates, a list of `field: old -> new`; for insert/delete, key/value pairs (stringify values, skip nulls). Use `LoadingState`/`ErrorState`/`EmptyState`. Cap the details rendering to readable scalars (JSON.stringify objects).

- [ ] **Step 2: Wire into AdminDashboard**

Import `AuditLog` and add `'audit'` to the `View` union. Add a StatTile "Activity log" (icon `ScrollText`) for all admins; value can be `0` or omitted-as-hint. Render `{view === 'audit' && (<><h2 ...>Activity log</h2><AuditLog /></>)}`.

- [ ] **Step 3: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 4: Commit** (PowerShell)
```
git -C "C:\Users\paulo\kariba-boats" -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -am "Add admin activity log UI"
```

---

## Task 4: Verify end to end and clean up

- [ ] **Step 1: Real-action audit checks** (authenticated API, throwaway accounts + a throwaway promoted super-admin as in prior tasks):
  - owner signs up + is verified; owner registers a boat (insert) and uploads an image (insert); admin approves (boats update); tourist books (bookings insert); owner cancels via RPC (bookings update); delete a boat_images row (delete).
  - As admin call `admin_list_audit` (no filter) and confirm entries for each action with the right `actor_email` and `action`; confirm the boat insert has a snapshot and the booking update has `changed` with status old/new; confirm the image delete row carries the full snapshot.
  - Filter checks: `admin_list_audit(p_entity_type => 'bookings')` returns only booking entries; `p_action => 'delete'` returns only deletes.
  - Non-admin call -> `'Administrator only'`. Attempt `update public.audit_log ...` via REST as admin -> blocked (no policy).

- [ ] **Step 2: UI check** — start preview; sign in as a throwaway super-admin; open the Activity log tile; confirm entries render with actor, action chips, and expandable change details; filters work.

- [ ] **Step 3: Gates** — `npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass; `get_advisors type: security` zero ERROR.

- [ ] **Step 4: Clean up** throwaway accounts/boats/bookings/hotels/images so only `cyton.kwanisi@agri-forge.net` remains. Clear the audit rows generated during verification (`delete from public.audit_log;` via SQL) for a pristine alpha start. Confirm `cyton` retains super-admin.

- [ ] **Step 5: Commit** (PowerShell)
```
git -C "C:\Users\paulo\kariba-boats" -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Verify audit trail end to end"
```

---

## Self-review notes
- Spec coverage: table + trigger + RPC (Task 1); types + service (Task 2); UI (Task 3); verification + cleanup (Task 4).
- No placeholders: full migration SQL, service code, and UI spec included.
- Type consistency: `admin_list_audit` columns map to `AuditEntry` (actorEmail/actorName/entityType/entityId/createdAt/changed); component uses `listAudit`.
- Append-only: audit_log has only a select policy; trigger (definer) is the sole writer; verification asserts client updates are blocked.
