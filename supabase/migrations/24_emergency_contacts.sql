-- Subsystem E: admin-managed emergency contacts. A single platform-wide list the admin
-- maintains (no generic seeded contact). Readable by everyone (safety information),
-- writable only by admins. Shown to users on their trips, on a confirmed booking, and
-- in the boat detail safety section.

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  phone text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index emergency_contacts_sort_idx on public.emergency_contacts (sort_order, created_at);

alter table public.emergency_contacts enable row level security;
create policy "emergency_read_all" on public.emergency_contacts
  for select to anon, authenticated using (true);
create policy "emergency_write_admin" on public.emergency_contacts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.emergency_contacts from anon, authenticated;
grant select on public.emergency_contacts to anon, authenticated;
grant insert, update, delete on public.emergency_contacts to authenticated;

create trigger audit_emergency_contacts after insert or update or delete on public.emergency_contacts
  for each row execute function public.record_audit();
