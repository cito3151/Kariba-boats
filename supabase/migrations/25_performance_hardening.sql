-- Subsystem F (backend): performance and scale hardening from the Supabase advisor.
-- 1) Wrap auth.uid()/is_admin()/current_user_role() in (select ...) inside RLS policies
--    so they are evaluated once per query instead of once per row (auth_rls_initplan).
--    ALTER POLICY preserves the policy otherwise; the boolean logic is unchanged.
-- 2) Add covering indexes for unindexed foreign keys.

-- ---- RLS initplan rewrites -------------------------------------------------

alter policy "approval_logs_read" on public.admin_approval_logs
  using ((select is_admin()) or (exists (
    select 1 from boats b where b.id = admin_approval_logs.boat_id and b.owner_id = (select auth.uid()))));

alter policy "boat_images_read_visible" on public.boat_images
  using (exists (select 1 from boats b where b.id = boat_images.boat_id
    and ((b.owner_id = (select auth.uid())) or (select is_admin())
      or (b.status = 'approved'::boat_status and b.is_active and not b.is_deleted))));

alter policy "boat_images_write_own" on public.boat_images
  using (exists (select 1 from boats b where b.id = boat_images.boat_id
    and ((b.owner_id = (select auth.uid())) or (select is_admin()))))
  with check (exists (select 1 from boats b where b.id = boat_images.boat_id
    and ((b.owner_id = (select auth.uid())) or (select is_admin()))));

alter policy "maint_read_own_or_admin" on public.boat_maintenance_records
  using (exists (select 1 from boats b where b.id = boat_maintenance_records.boat_id
    and ((b.owner_id = (select auth.uid())) or (select is_admin()))));

alter policy "hours_read_own_or_admin" on public.boat_operating_hours
  using (exists (select 1 from boats b where b.id = boat_operating_hours.boat_id
    and ((b.owner_id = (select auth.uid())) or (select is_admin()))));

alter policy "boats_insert_own_as_owner" on public.boats
  with check ((owner_id = (select auth.uid())) and ((select current_user_role()) = 'owner'::user_role));

alter policy "boats_read_public_or_own_or_admin" on public.boats
  using (((status = 'approved'::boat_status and is_active and not is_deleted and maintenance_status <> 'overdue'::text)
    or (owner_id = (select auth.uid())) or (select is_admin())));

alter policy "boats_update_own" on public.boats
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "bookings_read_involved" on public.bookings
  using ((tourist_id = (select auth.uid())) or (select is_admin())
    or (exists (select 1 from boats b where b.id = bookings.boat_id and b.owner_id = (select auth.uid())))
    or (hotel_id = (select profiles.hotel_id from profiles where profiles.id = (select auth.uid())))
    or (agency_id = (select profiles.agency_id from profiles where profiles.id = (select auth.uid()))));

alter policy "bookings_update_involved" on public.bookings
  using ((select is_admin())
    or (exists (select 1 from boats b where b.id = bookings.boat_id and b.owner_id = (select auth.uid())))
    or (tourist_id = (select auth.uid())))
  with check ((select is_admin())
    or (exists (select 1 from boats b where b.id = bookings.boat_id and b.owner_id = (select auth.uid())))
    or (tourist_id = (select auth.uid())));

alter policy "captains_owner_all" on public.captains
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "consent_records_read_own" on public.consent_records
  using ((user_id = (select auth.uid())) or (select is_admin()));

alter policy "notif_read_own" on public.maintenance_notifications
  using ((recipient_id = (select auth.uid())) or (select is_admin()));

alter policy "notif_update_own" on public.maintenance_notifications
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

alter policy "profiles_read_own_or_admin" on public.profiles
  using ((id = (select auth.uid())) or (select is_admin()));

alter policy "profiles_update_own_or_admin" on public.profiles
  using ((id = (select auth.uid())) or (select is_admin()))
  with check ((id = (select auth.uid())) or (select is_admin()));

alter policy "reviews_insert_own" on public.reviews
  with check (tourist_id = (select auth.uid()));

alter policy "reviews_update_owner_response" on public.reviews
  using ((exists (select 1 from boats b where b.id = reviews.boat_id and b.owner_id = (select auth.uid()))) or (select is_admin()));

alter policy "vdocs_select_own_or_admin" on public.verification_documents
  using ((user_id = (select auth.uid())) or (select is_admin()));

alter policy "vdocs_insert_own" on public.verification_documents
  with check (user_id = (select auth.uid()));

alter policy "vdocs_delete_own" on public.verification_documents
  using (user_id = (select auth.uid()));

-- ---- Covering indexes for unindexed foreign keys ---------------------------

create index if not exists admin_approval_logs_admin_id_idx on public.admin_approval_logs (admin_id);
create index if not exists boat_images_uploaded_by_idx on public.boat_images (uploaded_by);
create index if not exists boat_maintenance_records_performed_by_idx on public.boat_maintenance_records (performed_by);
create index if not exists boat_operating_hours_logged_by_idx on public.boat_operating_hours (logged_by);
create index if not exists boats_approved_by_idx on public.boats (approved_by);
create index if not exists bookings_hotel_id_idx on public.bookings (hotel_id);
create index if not exists consent_records_document_id_idx on public.consent_records (document_id);
create index if not exists maintenance_notifications_recipient_id_idx on public.maintenance_notifications (recipient_id);
create index if not exists profiles_agency_id_idx on public.profiles (agency_id);
create index if not exists profiles_hotel_id_idx on public.profiles (hotel_id);
create index if not exists profiles_reviewed_by_idx on public.profiles (reviewed_by);
create index if not exists reviews_tourist_id_idx on public.reviews (tourist_id);
