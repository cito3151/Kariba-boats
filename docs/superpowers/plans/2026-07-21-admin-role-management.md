# Admin and Role Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A super-admin can manage roles and admins from the dashboard; regular admins cannot.

**Architecture:** An `is_super_admin` flag on profiles (on top of the admin role), a super-admin-only `admin_set_role` RPC with last-super-admin protection, an `admin_list_users` RPC exposing emails to super-admins, and a super-admin-only Admins & roles UI. `guard_profile_privileges` is tightened so role changes require super-admin.

**Tech Stack:** Supabase (Postgres 17), supabase-js v2, React 19, TypeScript, Vite.

## Global Constraints

- Project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz`.
- Migration applied via MCP AND saved to `supabase/migrations/16_add_super_admin_and_role_management.sql`.
- Commit each task with `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes. After migration, `get_advisors type: security` zero ERROR.

---

## Task 1: Super-admin flag, guard, and role RPCs (migration 16)

**Files:** Migration `add_super_admin_and_role_management`; save `supabase/migrations/16_add_super_admin_and_role_management.sql`.

**Interfaces produced:** `profiles.is_super_admin`; `is_super_admin()`; `admin_set_role(uuid, user_role, boolean)`; `admin_list_users()`.

- [ ] **Step 1: Apply the migration**

```sql
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
```

- [ ] **Step 2: Verify** with `execute_sql`:
```sql
select is_super_admin from public.profiles where role = 'admin';
select proname from pg_proc where proname in ('is_super_admin','admin_set_role','admin_list_users') order by proname;
```
Expected: existing admin has `is_super_admin` true; three functions present.

- [ ] **Step 3: Save** identical SQL to `supabase/migrations/16_add_super_admin_and_role_management.sql` with a leading comment.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add super-admin flag, role guard, and role management RPCs"
```

---

## Task 2: Types and service layer

**Files:** Modify `src/types/database.ts` (regenerated), `src/services/auth.service.ts`, `src/services/users.service.ts`.

- [ ] **Step 1: Regenerate types** via `generate_typescript_types`, write to `src/types/database.ts`.

- [ ] **Step 2: auth.service.ts** — add `isSuperAdmin` to `AppUser` and `fetchProfile`:
```ts
// in AppUser interface add:
  isSuperAdmin: boolean;
// in fetchProfile select add is_super_admin:
    .select('id, role, full_name, phone, business_name, hotel_id, verification_status, verification_note, is_super_admin')
// in the returned object add:
    isSuperAdmin: data.is_super_admin,
```

- [ ] **Step 3: users.service.ts** — add:
```ts
export interface ManagedUser {
  id: string; email: string; fullName: string;
  role: 'tourist' | 'owner' | 'hotel' | 'admin';
  isSuperAdmin: boolean; verificationStatus: VerificationStatus;
}

export async function listAllUsers(): Promise<ManagedUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw new Error(humanizeError(error.message));
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => ({
    id: r.id, email: r.email, fullName: r.full_name, role: r.role,
    isSuperAdmin: r.is_super_admin, verificationStatus: r.verification_status,
  }));
}

export async function setUserRole(userId: string, role: ManagedUser['role'], isSuperAdmin: boolean) {
  const { error } = await supabase.rpc('admin_set_role', {
    p_user_id: userId, p_role: role, p_is_super_admin: isSuperAdmin,
  });
  if (error) throw new Error(humanizeError(error.message));
}
```

- [ ] **Step 4: Verify** `npx tsc -b --noEmit` (errors only in AdminDashboard if it references isSuperAdmin before Task 3; otherwise clean).

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add super-admin to types and role management services"
```

---

## Task 3: Role management UI (super-admin only)

**Files:** Create `src/components/admin/RoleManagement.tsx`; modify `src/pages/AdminDashboard.tsx`.

- [ ] **Step 1: RoleManagement component**

Loads `useAsync(listAllUsers)`. A text input filters by email or full name (case-insensitive). Each user row shows email, full name, a super-admin badge when set, a role `<select>` (tourist/owner/hotel/admin), a super-admin checkbox (only meaningful when role is admin), and a Save button calling `setUserRole(id, role, isSuperAdmin)` then reload. Inline per-row error (the last-super-admin guard message shows here). Use `LoadingState`/`ErrorState`/`EmptyState` and the existing chip styles.

- [ ] **Step 2: Wire into AdminDashboard (super-admin only)**

Import `RoleManagement`. Add a `users`-style view key `'roles'` to the `view` union. Add a `StatTile` labeled "Admins & roles" rendered ONLY when `currentUser?.isSuperAdmin` (value: count of `verificationStatus`-independent admins is not available from boat data, so use a simple label; set value to 0 or the admins count if fetched). Simplest: render the tile with value `0` is odd; instead fetch nothing and show the section below the tiles when `view === 'roles'`. Implementation: conditionally include the tile in the `tiles` array only for super-admins, and render `<RoleManagement />` when `view === 'roles'`.

Concretely, in `AdminDashboard.tsx`:
```tsx
import RoleManagement from '../components/admin/RoleManagement';
import { UserCog } from 'lucide-react';
// widen View:
type View = 'queue' | 'all' | 'live' | 'attention' | 'bookings' | 'users' | 'roles';
// after building the base tiles array, conditionally add:
if (currentUser?.isSuperAdmin) {
  tiles.push({ key: 'roles', label: 'Admins & roles', value: (userData ?? []).filter((u) => u.role === 'admin' || u.role === 'hotel' || u.role === 'owner').length, icon: UserCog });
}
// in the body:
{view === 'roles' && currentUser?.isSuperAdmin && (<><h2 className="mb-3 font-semibold text-lake-950">Admins and roles</h2><RoleManagement /></>)}
```
Read `currentUser` from `useAuth()` (add the import if missing). The tile value can reuse the already-fetched `userData` (owners/hotels) length; it is only a hint, not load-bearing.

- [ ] **Step 3: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add super-admin-only role management UI"
```

---

## Task 4: Verify end to end and clean up

- [ ] **Step 1: Role RPC checks (authenticated API)** using a throwaway promoted super-admin token (the real super-admin password is unknown), created via SQL as in prior tasks:
  - Sign up `rm-owner` (owner) and `rm-admin`; promote `rm-admin` to admin + super_admin via SQL (disable guard, set role/flag, re-enable).
  - As `rm-admin` (super): `admin_list_users` returns rows with emails. `admin_set_role(rm-owner, 'admin', false)` -> rm-owner role admin. `admin_set_role(rm-owner, 'owner', false)` -> back to owner.
  - Promote rm-owner to super-admin, then demote rm-admin: allowed (two supers). Then try to demote the remaining single super -> blocked with the last-super-admin message.
  - As `rm-owner` while a plain owner: `admin_set_role(...)` -> `'Super administrator only'`. `admin_list_users` -> rejected.

- [ ] **Step 2: UI checks** — start preview; sign in as the throwaway super-admin: Admins & roles tile visible, list shows emails, promote by searching an email works. Sign in as a regular admin (create one): the tile/section is absent.

- [ ] **Step 3: Gates** — `npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass; `get_advisors type: security` zero ERROR.

- [ ] **Step 4: Clean up** all throwaway accounts so only `cyton.kwanisi@agri-forge.net` (super-admin) remains, zero boats/bookings. Confirm `cyton` still has `is_super_admin = true`.

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Verify admin and role management end to end"
```

---

## Self-review notes
- Spec coverage: flag + guard + RPCs (Task 1); types + services (Task 2); super-admin-only UI (Task 3); verification + cleanup (Task 4).
- No placeholders: full migration SQL and service code included; UI specified with exact fields, the View union change, and the conditional tile.
- Type consistency: `admin_set_role`/`admin_list_users` names match services; `isSuperAdmin` added to `AppUser` (auth.service) and `ManagedUser` (users.service); `setUserRole`/`listAllUsers` used in RoleManagement.
