-- Bug: the owner portal routes and "Register a boat" form are reachable by admins
-- (ProtectedRoute allow owner+admin), but boats_insert_own_as_owner only permitted
-- role = 'owner', so an admin registering a boat hit
-- "new row violates row-level security policy". Admin is a superuser who can do
-- anything an owner can, and the owner RPCs (log hours, maintenance, soft delete)
-- already accept admin, so allow admin to insert their own boats too.
drop policy "boats_insert_own_as_owner" on public.boats;

create policy "boats_insert_own_or_admin" on public.boats
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (public.current_user_role() = 'owner' or public.is_admin())
  );
