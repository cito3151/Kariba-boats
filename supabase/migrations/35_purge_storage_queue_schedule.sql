-- Daily removal of purged accounts' files from Storage.
--
-- Migration 33 queues the registration-docs paths of purged accounts in
-- public.account_purge_storage_queue, because SQL cannot delete storage objects.
-- The Edge Function purge-storage-queue (supabase/functions/purge-storage-queue)
-- empties the queue through the Storage API. This migration calls it every day at
-- 02:47 UTC (04:47 in Harare), half an hour after purge_deleted_accounts runs at
-- 02:17, through pg_cron and pg_net.
--
-- What this migration does:
--  1. Enables pg_net (HTTP from SQL). pg_cron is already enabled by migration 33.
--  2. Creates the Vault secret purge_storage_queue_secret with a random value, if
--     it does not exist yet. It is generated here, in the database, and is never
--     written to the repository, a function secret or a log.
--  3. purge_storage_queue_secret_ok(text): the Edge Function asks the database
--     whether the caller's x-purge-secret header matches. Service role only.
--  4. invoke_purge_storage_queue(): reads the project URL and the secret from
--     Vault and POSTs to the function. Service role / pg_cron only.
--  5. Schedules it as the pg_cron job 'purge-storage-queue'.
--
-- One setting is per project and not created here: the Vault secret project_url,
-- the API URL the function is reached at (SQL editor, once):
--     select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- Until it exists the job fails with a clear message in cron.job_run_details and
-- the queue simply waits. See supabase/functions/README.md.
--
-- Security model. Both functions are SECURITY DEFINER (they read
-- vault.decrypted_secrets) with search_path pinned, revoked from PUBLIC, anon and
-- authenticated, and granted to service_role; pg_cron runs the caller as the
-- owner. The Edge Function is deployed without JWT verification and accepts only
-- a request whose x-purge-secret matches the Vault secret.

-- 1. pg_net ----------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net could not be enabled (%). Enable it under Database -> Extensions, then re-run this migration.', sqlerrm;
end $$;

-- 2. The shared secret -----------------------------------------------------------
-- Two v4 UUIDs: 244 random bits as 64 hex characters, with no extension needed.

do $$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'purge_storage_queue_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'purge_storage_queue_secret',
      'Shared secret between pg_cron (invoke_purge_storage_queue) and the purge-storage-queue Edge Function.');
  end if;
end $$;

-- 3. The secret check ------------------------------------------------------------
-- Compares digests, so the comparison takes the same time however much of the
-- guess is right.

create or replace function public.purge_storage_queue_secret_ok(p_secret text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_secret text;
begin
  if auth.uid() is not null then
    raise exception 'Not allowed';
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'purge_storage_queue_secret';
  if v_secret is null or p_secret is null or length(v_secret) < 32 then
    return false;
  end if;
  return sha256(convert_to(p_secret, 'UTF8')) = sha256(convert_to(v_secret, 'UTF8'));
end; $$;

revoke all on function public.purge_storage_queue_secret_ok(text) from public, anon, authenticated;
grant execute on function public.purge_storage_queue_secret_ok(text) to service_role;

comment on function public.purge_storage_queue_secret_ok(text) is
  'True when the argument equals the Vault secret purge_storage_queue_secret. Called by the purge-storage-queue Edge Function with the service role.';

-- 4. The caller ------------------------------------------------------------------

create or replace function public.invoke_purge_storage_queue()
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url text;
  v_secret text;
begin
  -- Only a trusted server caller: the service role or pg_cron.
  if auth.uid() is not null then
    raise exception 'Not allowed';
  end if;

  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'project_url';
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'purge_storage_queue_secret';
  if v_url is null or v_secret is null then
    raise exception 'Vault secrets project_url and purge_storage_queue_secret must both be set. See supabase/functions/README.md.';
  end if;

  -- Asynchronous: returns the pg_net request id at once. The response lands in
  -- net._http_response. The timeout covers the function's own 60 s budget.
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/purge-storage-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end; $$;

revoke all on function public.invoke_purge_storage_queue() from public, anon, authenticated;
grant execute on function public.invoke_purge_storage_queue() to service_role;

comment on function public.invoke_purge_storage_queue() is
  'Calls the purge-storage-queue Edge Function through pg_net with the shared secret from Vault. Service role / pg_cron only. Returns the pg_net request id.';

-- 5. Daily schedule --------------------------------------------------------------
-- cron.schedule with an existing job name updates that job, so re-running this is
-- safe.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not enabled. Schedule public.invoke_purge_storage_queue() manually.';
    return;
  end if;
  perform cron.schedule(
    'purge-storage-queue',
    '47 2 * * *',
    'select public.invoke_purge_storage_queue()'
  );
end $$;

notify pgrst, 'reload schema';
