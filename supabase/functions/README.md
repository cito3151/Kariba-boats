# Edge Functions

## purge-storage-queue

Removes the files of purged accounts from Storage. `purge_deleted_accounts()`
(migration 33, daily at 02:17 UTC) queues the `registration-docs` paths of each
purged account in `public.account_purge_storage_queue`, because SQL cannot delete
storage objects. This function removes them through the Storage API with the
service role and stamps `removed_at`. Migration 35 calls it daily at 02:47 UTC
through pg_cron and pg_net.

Each run reads pending rows in batches of 100, oldest first (at most 10 batches or
60 seconds). A row is stamped when its file was removed, or is confirmed already
absent. Anything else is logged by queue row id (never by path) and left for the
next run.

### Deploy

It needs one secret of its own, shared with the database. Generate a random value
of at least 32 characters (for example `openssl rand -hex 32`) and keep it out of
the repository.

1. Give the function the secret, then deploy it. JWT verification is off because
   the caller authenticates with the shared secret in the `x-purge-secret` header;
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.

   ```bash
   supabase secrets set PURGE_STORAGE_QUEUE_SECRET=<value> --project-ref sbrsptgpnjljnongklus
   ```

   ```bash
   supabase functions deploy purge-storage-queue --no-verify-jwt --project-ref sbrsptgpnjljnongklus
   ```

2. Store the project URL and the same secret in Vault (SQL editor, once):

   ```sql
   select vault.create_secret('https://sbrsptgpnjljnongklus.supabase.co', 'project_url');
   select vault.create_secret('<value>', 'purge_storage_queue_secret');
   ```

   To rotate the secret later, change both sides: `supabase secrets set ...` and
   `select vault.update_secret(id, '<new value>') from vault.secrets where name = 'purge_storage_queue_secret';`

3. Apply `supabase/migrations/35_purge_storage_queue_schedule.sql`.

### Verify

Trigger a run without waiting for 02:47:

```sql
select public.invoke_purge_storage_queue();   -- returns the pg_net request id
```

A few seconds later, read the response. A healthy run is status 200 with a body like
`{"batches":0,"removed":0,"alreadyAbsent":0,"failed":0}`; 401 means the two copies
of the secret differ, 500 means a function secret is missing (see the function logs).

```sql
select id, status_code, content, error_msg, created
  from net._http_response order by created desc limit 5;
```

Then check the queue and the scheduled runs:

```sql
select count(*) filter (where removed_at is null) as pending,
       count(*) filter (where removed_at is not null) as removed
  from public.account_purge_storage_queue;

select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname in ('purge-deleted-accounts', 'purge-storage-queue')
 order by d.start_time desc limit 10;
```

Failures are logged under **Edge Functions → purge-storage-queue → Logs** in the
dashboard. A row that keeps failing stays pending and is retried every day.
