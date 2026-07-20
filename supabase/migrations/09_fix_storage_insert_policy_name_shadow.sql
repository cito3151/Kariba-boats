-- Bug in migration 03: inside the EXISTS subquery, unqualified `name` in
-- storage.foldername(name) binds to boats.name (the boat's display name) instead
-- of the storage object path, because boats has a `name` column that shadows the
-- storage.objects.name column. foldername of a boat name has no second path
-- segment, so the check was always false and every owner upload was rejected.
-- Qualify the object name as objects.name to reference the outer row explicitly.
drop policy "storage_boat_images_insert_own" on storage.objects;

create policy "storage_boat_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'boat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.boats b
                where b.id::text = (storage.foldername(objects.name))[2]
                  and b.owner_id = auth.uid())
  );
