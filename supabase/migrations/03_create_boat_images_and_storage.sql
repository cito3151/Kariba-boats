insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boat-images', 'boat-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.boat_images (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','approved','rejected')),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index boat_images_boat_idx on public.boat_images (boat_id, sort_order);
create unique index boat_images_one_primary on public.boat_images (boat_id) where is_primary;

-- Cap of 10 images per boat, enforced server side.
create or replace function public.enforce_image_cap()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  existing int;
begin
  select count(*) into existing from public.boat_images where boat_id = new.boat_id;
  if existing >= 10 then
    raise exception 'A boat may have at most 10 images. Delete one before uploading another.';
  end if;
  return new;
end; $$;

create trigger boat_images_cap
before insert on public.boat_images
for each row execute function public.enforce_image_cap();

alter table public.boat_images enable row level security;

create policy "boat_images_read_visible" on public.boat_images
  for select to anon, authenticated
  using (
    exists (select 1 from public.boats b where b.id = boat_id
            and (b.owner_id = auth.uid() or public.is_admin()
                 or (b.status = 'approved' and b.is_active and not b.is_deleted)))
  );

create policy "boat_images_write_own" on public.boat_images
  for all to authenticated
  using (exists (select 1 from public.boats b
                 where b.id = boat_id and (b.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.boats b
                      where b.id = boat_id and (b.owner_id = auth.uid() or public.is_admin())));

-- Storage: an owner may only write inside their own folder, and only for a boat they own.
create policy "storage_boat_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'boat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.boats b
                where b.id::text = (storage.foldername(name))[2] and b.owner_id = auth.uid())
  );

create policy "storage_boat_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'boat-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "storage_boat_images_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'boat-images');
