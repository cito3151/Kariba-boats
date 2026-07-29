-- Fold the duplicate permissive SELECT policies on the two hot-path tables into a
-- single policy each, so only one policy runs per read (multiple_permissive_policies).
-- profiles and legal_documents are read on nearly every page; the remaining three
-- flagged tables (hotels, emergency_contacts, boat_images) are tiny or admin-only and
-- left as-is.

-- profiles: merge "read owners public" into the own-or-admin policy.
drop policy if exists "profiles_read_owners_public" on public.profiles;
alter policy "profiles_read_own_or_admin" on public.profiles
  using ((id = (select auth.uid())) or (select is_admin()) or (role = 'owner'::user_role));

-- legal_documents: merge the admin-read-all into the current-docs read policy.
drop policy if exists "legal_documents_read_all_admin" on public.legal_documents;
alter policy "legal_documents_read_current" on public.legal_documents
  using (is_current or (select is_admin()));
