-- Subsystem C: verification documents. A private bucket for company registration
-- documents, a table tracking them, and a gate so an admin cannot verify an owner or
-- hotel until at least one document is on file. Documents are sensitive, so the bucket
-- is private and admins view them via short-lived signed URLs.

insert into storage.buckets (id, name, public)
values ('registration-docs', 'registration-docs', false)
on conflict (id) do nothing;

-- Storage RLS: a user manages only their own folder ({auth.uid()}/...); admins read all.
create policy "regdocs_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'registration-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "regdocs_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'registration-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "regdocs_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'registration-docs' and public.is_admin());
create policy "regdocs_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'registration-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  label text,
  uploaded_at timestamptz not null default now()
);
create index verification_documents_user_idx on public.verification_documents (user_id);

alter table public.verification_documents enable row level security;
create policy "vdocs_select_own_or_admin" on public.verification_documents
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "vdocs_insert_own" on public.verification_documents
  for insert to authenticated with check (user_id = auth.uid());
create policy "vdocs_delete_own" on public.verification_documents
  for delete to authenticated using (user_id = auth.uid());
revoke all on public.verification_documents from anon;
grant select, insert, delete on public.verification_documents to authenticated;

create trigger audit_verification_documents after insert or update or delete on public.verification_documents
  for each row execute function public.record_audit();

-- Verify gate: cannot mark an account verified with zero documents.
create or replace function public.admin_review_account(p_user_id uuid, p_status verification_status, p_trust_score integer default null, p_note text default null)
 returns profiles language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score is not null and (p_trust_score < 0 or p_trust_score > 100) then
    raise exception 'Trust score must be between 0 and 100';
  end if;
  if p_status = 'verified' and not exists (
    select 1 from public.verification_documents where user_id = p_user_id) then
    raise exception 'This account has not uploaded any registration documents yet.';
  end if;
  update public.profiles set
    verification_status = p_status,
    trust_score = coalesce(p_trust_score, trust_score),
    verification_note = p_note,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id returning * into v_profile;
  if v_profile.id is null then raise exception 'User not found'; end if;
  return v_profile;
end; $function$;

create or replace function public.admin_verify_hotel(p_user_id uuid, p_hotel_name text, p_location text, p_commission numeric default 8, p_trust_score integer default 90)
 returns profiles language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_profile public.profiles; v_hotel_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score < 0 or p_trust_score > 100 then raise exception 'Trust score must be between 0 and 100'; end if;
  if not exists (select 1 from public.verification_documents where user_id = p_user_id) then
    raise exception 'This account has not uploaded any registration documents yet.';
  end if;
  insert into public.hotels (name, location, commission_rate, is_verified)
  values (p_hotel_name, p_location, coalesce(p_commission, 8), true) returning id into v_hotel_id;
  update public.profiles set
    hotel_id = v_hotel_id, verification_status = 'verified',
    trust_score = p_trust_score, verification_note = null,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id returning * into v_profile;
  return v_profile;
end; $function$;
