-- Follow-up to 28. `revoke ... from anon` does not remove a function's default
-- EXECUTE grant, which Postgres gives to PUBLIC, so the new functions were still
-- reachable through /rest/v1/rpc without signing in. They already refuse a caller
-- who is not an admin, but they should not be callable at all: revoke PUBLIC and
-- grant execute back to the roles that legitimately need it.

revoke all on function public.admin_review_document(uuid, text, text) from public, anon;
revoke all on function public.admin_review_company(uuid, company_verification_status, text) from public, anon;
revoke all on function public.current_user_company() from public, anon;
revoke all on function public.is_company_member(uuid) from public, anon;

grant execute on function public.admin_review_document(uuid, text, text) to authenticated;
grant execute on function public.admin_review_company(uuid, company_verification_status, text) to authenticated;
grant execute on function public.current_user_company() to authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;

-- No anon-facing policy calls these: every policy added in 28 is `to authenticated`,
-- and the anon path into boats goes through the public_boats view, which runs as its
-- owner. So anon needs none of them.
