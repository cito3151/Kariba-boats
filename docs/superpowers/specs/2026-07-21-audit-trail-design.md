# Audit Trail Design (transparency and monitoring)

**Goal:** An append-only audit log records who did what across the core domain, including deletions with a full before-image, viewable by admins. This is subsystem 3 of four governance subsystems (after account verification and admin/role management; before terms/consent).

**Context:** Actions flow through RPCs and direct table writes. Only `admin_approval_logs` (admin boat actions) is recorded today. There is no general activity trail, and hard deletes (reviews, images, users) leave no trace. Decision from brainstorming: capture via database triggers; the audit snapshot on delete is sufficient (no broad soft-delete conversion this round).

## Global constraints

- Supabase project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz`.
- Migrations applied via MCP AND saved to `supabase/migrations/NN_name.sql` (identical SQL). Next number is `17`.
- Commit each task as `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes. After migrations, `get_advisors type: security` zero ERROR.
- Alpha DB: only `cyton.kwanisi@agri-forge.net` (super-admin) exists.

## Data model (migration 17: `add_audit_trail`)

`public.audit_log`:
- `id uuid primary key default gen_random_uuid()`
- `actor_id uuid` (auth.uid() at action time; null for system/SQL)
- `actor_role text` (role snapshot; null for system)
- `action text not null check (action in ('insert','update','delete'))`
- `entity_type text not null` (source table name)
- `entity_id uuid`
- `label text` (human tag: boat name / guest name / full name / hotel name when present)
- `changed jsonb` (insert/delete: full row snapshot; update: `{col: {old, new}}` for changed columns, excluding updated_at)
- `created_at timestamptz not null default now()`
- index on `(created_at desc)` and `(entity_type, created_at desc)`

RLS: enable. `audit_log_read_admin` for select to authenticated using `public.is_admin()`. No insert/update/delete policies, so clients cannot write or alter the log; rows are inserted only by the SECURITY DEFINER trigger. `revoke all on public.audit_log from anon, authenticated; grant select to authenticated` (RLS still gates rows to admins).

## Trigger function and attachments

`public.record_audit()` returns trigger, SECURITY DEFINER, `set search_path = public, pg_temp`:
- `v_old := to_jsonb(old)`, `v_new := to_jsonb(new)` as applicable.
- action = lower(TG_OP); entity_type = TG_TABLE_NAME; entity_id = `coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid)`.
- label = `coalesce(v_new->>'name', v_old->>'name', v_new->>'guest_name', v_old->>'guest_name', v_new->>'full_name', v_old->>'full_name')`.
- changed:
  - INSERT: `v_new`.
  - DELETE: `v_old`.
  - UPDATE: `jsonb_object_agg(key, jsonb_build_object('old', o, 'new', n))` over keys where `old`/`new` differ, excluding `updated_at`. If no non-updated_at changes, skip logging (return).
- actor_id = `auth.uid()`; actor_role = `(select role::text from public.profiles where id = auth.uid())`.
- Insert into `public.audit_log(...)`. Return `coalesce(new, old)`.

Attach `after insert or update or delete for each row execute function public.record_audit()` on: `boats`, `bookings`, `profiles`, `boat_images`, `reviews`, `hotels`. Not on ledger/log tables (`boat_operating_hours`, `boat_maintenance_records`, `maintenance_notifications`, `admin_approval_logs`, `audit_log`).

## Read RPC

`admin_list_audit(p_entity_type text default null, p_action text default null, p_limit int default 100) returns table(id uuid, created_at timestamptz, actor_id uuid, actor_email text, actor_name text, actor_role text, action text, entity_type text, entity_id uuid, label text, changed jsonb)` — admin only (`if not is_admin() then raise 'Administrator only'`). Left joins `auth.users`/`profiles` for actor email/name. Filters by entity_type/action when provided. Orders by created_at desc, limit clamped to 500. `set search_path = public, pg_temp, auth`. Revoke from public/anon, grant execute to authenticated.

## Service and UI

- `src/services/audit.service.ts`: `AuditEntry` type and `listAudit({ entityType?, action?, limit? })` -> `admin_list_audit`, mapping snake_case to camelCase (`actorEmail`, `actorName`, `entityType`, `entityId`, `createdAt`, `changed`).
- Regenerate `src/types/database.ts`.
- `src/components/admin/AuditLog.tsx`: loads `listAudit`, with two `<select>` filters (entity type: all/boats/bookings/profiles/boat_images/reviews/hotels; action: all/insert/update/delete). Each row shows timestamp, actor (email or "system"), an action chip, `entity_type` + label, and an expandable view of `changed` (rendered as field: old -> new for updates, or key/value for snapshots). Uses `LoadingState`/`ErrorState`/`EmptyState`.
- `src/pages/AdminDashboard.tsx`: add an "Activity log" tile/view (all admins) rendering `<AuditLog />`. Reuse the `view`/`StatTile` pattern; tile value can be the count returned by a small recent-activity fetch or simply omitted-as-0; keep it a navigation control.

## Verification (live DB, no dummy data)

- Perform real actions with throwaway accounts: owner registers a boat (insert), admin verifies the account (profiles update), admin approves the boat (boats update), tourist books (bookings insert), owner cancels (bookings update), delete a review/image row (delete). Then as admin call `admin_list_audit` and confirm entries exist for each with correct actor and a before/after; confirm the delete entry carries the full snapshot in `changed`.
- Confirm a non-admin calling `admin_list_audit` is rejected, and that `audit_log` cannot be updated/deleted through the API (no policy).
- `npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass; advisor zero ERROR. Clean up throwaways so only the super-admin remains; the audit rows generated during verification may be left (they are history) or cleared, cleared for a pristine alpha start.

## Edge cases

| Case | Handling |
|---|---|
| Update touches only updated_at | Trigger skips logging (no meaningful change) |
| Row deleted | DELETE branch stores full before-image in changed |
| Action via SQL/migration (no auth.uid) | actor_id/actor_role null; shown as "system" |
| Non-admin reads audit | RLS + RPC reject |
| Anyone tries to edit/delete an audit row | No policy exists; denied |
| High-frequency updates (hours) | Logged; acceptable and intended for transparency |

## Out of scope

- Broad soft-delete conversion of reviews/images/hotels (audit snapshot covers deletions this round).
- Auth events (logins, password resets) live in Supabase auth logs, not this table.
- Terms and consent (subsystem 4).
