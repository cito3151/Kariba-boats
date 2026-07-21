# Admin and Role Management Design (super-admin)

**Goal:** A protected super-admin can promote/demote admins and change any user's role from the dashboard, replacing manual database edits. Regular admins keep content oversight and account verification but cannot touch roles. This is subsystem 2 of four governance subsystems (after account verification; before audit trail and terms/consent).

**Context:** Roles (tourist/owner/hotel/admin) exist; admin is granted only via SQL today. `is_admin()` gates oversight. `guard_profile_privileges` lets any admin change role/verification. Account verification (subsystem 1) is merged: `verification_status` tri-state, `admin_review_account`, `admin_verify_hotel`.

## Global constraints

- Supabase project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz`.
- Migrations applied via MCP AND saved to `supabase/migrations/NN_name.sql` (identical SQL). Next number is `16`.
- Commit each task as `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes. After migrations, `get_advisors type: security` zero ERROR.
- Alpha DB: only `cyton.kwanisi@agri-forge.net` (admin) exists.

## Decisions

- Super-admin is a boolean flag on top of the admin role, not a new login type. `is_admin()` unchanged (covers regular and super admins for oversight).
- Only a super-admin can manage roles / admin status. Regular admins cannot.
- Full role editor: super-admin can set any role and grant/revoke super-admin, with a guard that the last super-admin can never be removed.

## Data model (migration 16: `add_super_admin_and_role_management`)

1. `alter table public.profiles add column is_super_admin boolean not null default false;`
2. Backfill the founding super-admin: `update public.profiles set is_super_admin = true where role = 'admin';`
3. Helper: `is_super_admin()` returns boolean, `security definer stable set search_path = public, pg_temp`, `select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)`.
4. Tighten `guard_profile_privileges`: split the admin-only check so that `role` and `is_super_admin` changes require `is_super_admin()`, while `verification_status`, `verification_note`, `reviewed_by`, `reviewed_at`, `trust_score`, `hotel_id` changes require `is_admin()`. Non-privileged users still may change only full_name/phone/business_name (column grants unchanged).

## RPCs (migration 16 continued)

- `admin_set_role(p_user_id uuid, p_role user_role, p_is_super_admin boolean default false) returns public.profiles` — super-admin only.
  - Normalization: if `p_is_super_admin` then force `p_role := 'admin'`; if `p_role <> 'admin'` then force `p_is_super_admin := false`.
  - Last-super-admin guard: if the target is currently super-admin and the change would leave zero super-admins (`p_is_super_admin = false`), and `(select count(*) from public.profiles where is_super_admin) = 1`, raise `'You cannot remove the last super administrator.'`
  - Update role + is_super_admin; set updated_at. Return the profile.
- `admin_list_users() returns table(id uuid, email text, full_name text, role user_role, is_super_admin boolean, verification_status verification_status, created_at timestamptz)` — super-admin only; joins `auth.users` for email. Raises `'Super administrator only'` when caller is not super-admin.
- Both `revoke from public, anon; grant execute to authenticated` and check `is_super_admin()` internally.

## Service layer

- `auth.service.ts`: `AppUser` gains `isSuperAdmin: boolean`; `fetchProfile` selects `is_super_admin` and maps it.
- `users.service.ts`: add `ManagedUser` type (`id, email, fullName, role, isSuperAdmin, verificationStatus`), `listAllUsers()` -> `admin_list_users`, and `setUserRole(userId, role, isSuperAdmin)` -> `admin_set_role`. Existing `AppUserRow` and verification functions unchanged.
- Regenerate `src/types/database.ts`.

## Frontend

- New `src/components/admin/RoleManagement.tsx`: super-admin only. Loads `listAllUsers()`, a text filter (email or name), and per-user row with a role `<select>` (tourist/owner/hotel/admin), a super-admin checkbox, and Save (calls `setUserRole`). Shows a super-admin badge and the user's email. Inline errors (last-super-admin guard surfaces here). Reloads after each change.
- `src/pages/AdminDashboard.tsx`: add an "Admins & roles" view/tile rendered only when `currentUser.isSuperAdmin`. Regular admins do not see the tile or the section. Reuse the existing `view` state and `StatTile` pattern; the tile value is the count of admins.

## Verification (live DB, no dummy data)

- Super-admin (`cyton`, backfilled) calls `admin_list_users` -> returns users with emails. Non-super-admin call -> rejected.
- Sign up a throwaway owner; super-admin `admin_set_role(owner, 'admin')` -> role admin; `admin_set_role` promoting to super-admin sets the flag; demoting works.
- Create a throwaway admin, promote to super-admin, then attempt to demote the original: allowed (two exist). Attempt to demote when only one super-admin remains -> blocked.
- A regular admin calling `admin_set_role` -> `'Super administrator only'`. A non-admin -> rejected.
- UI: super-admin sees the Admins & roles section and can promote by searching an email; a regular admin does not see it.
- `npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass; advisor zero ERROR. Clean up throwaways so only `cyton.kwanisi@agri-forge.net` (super-admin) remains.

## Edge cases

| Case | Handling |
|---|---|
| Demote the last super-admin | RPC raises; blocked |
| Grant super-admin to a non-admin | RPC forces role to admin |
| Set a super-admin's role to non-admin | RPC forces is_super_admin false; blocked if last super-admin |
| Regular admin opens role tools | Section hidden; RPC rejects if called directly |
| Non-admin calls admin_set_role / admin_list_users | Rejected (super-admin only) |
| Super-admin demotes themselves while another exists | Allowed |

## Out of scope (later subsystems)

- Audit trail and soft deletes (subsystem 3) will log role changes; this subsystem does not add the general audit log.
- Terms and consent (subsystem 4).
