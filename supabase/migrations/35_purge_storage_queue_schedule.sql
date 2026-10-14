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
--  2. invoke_purge_storage_queue(): reads the project URL and the shared secret
--     from Supabase Vault and POSTs to the function. Service role / pg_cron only.
--  3. Schedules it as the pg_cron job 'purge-storage-queue'.
--
-- Secrets. Nothing secret is in this file. Before the job can succeed, two Vault
-- secrets must exist (SQL editor, once; the values are not committed anywhere):
--     select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--     select vault.create_secret('<random, at least 32 chars>', 'purge_storage_queue_secret');
-- and the function must hold the same secret value:
--     supabase secrets set PURGE_STORAGE_QUEUE_SECRET=<same value>
-- Until then the job fails with a clear message in cron.job_run_details and the
-- queue simply waits. See supabase/functions/README.md.
--
-- Security model. invoke_purge_storage_queue is SECURITY DEFINER (it reads
-- vault.decrypted_secrets) with search_path pinned, revoked from PUBLIC, anon and
-- authenticated, granted to service_role; pg_cron runs it as the owner. The
-- function it calls accepts only a request carrying the shared secret.

-- 1. pg_net ----------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net could not be enabled (%). Enable it under Database -> Extensions, then re-run this migration.', sqlerrm;
end $$;

-- 2. The caller ------------------------------------------------------------------

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

-- 3. Daily schedule --------------------------------------------------------------
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
