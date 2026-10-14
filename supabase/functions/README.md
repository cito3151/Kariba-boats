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

### How the caller is authenticated

The function is deployed with JWT verification off. pg_cron's call carries an
`x-purge-secret` header, and the function asks the database
(`purge_storage_queue_secret_ok`, service role only) whether it matches the Vault
secret `purge_storage_queue_secret`. Migration 35 generates that secret in SQL, so
it exists only in Vault: there is no function secret to set and nothing to keep out
of the repository. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to
the function by the platform.

### Deploy

1. Apply `supabase/migrations/35_purge_storage_queue_schedule.sql`. It enables
   pg_net, creates the secret, the two functions and the cron job.

2. Deploy the function with JWT verification off:

   ```bash
   supabase functions deploy purge-storage-queue --no-verify-jwt --project-ref sbrsptgpnjljnongklus
   ```

3. Store the project's API URL in Vault (SQL editor, once). It is not secret; it
   lives in Vault so the migration stays the same for every project:

   ```sql
   select vault.create_secret('https://sbrsptgpnjljnongklus.supabase.co', 'project_url');
   ```

To rotate the shared secret, delete it and re-run the migration's step 2, or
`select vault.update_secret(id, <new value>) from vault.secrets where name = 'purge_storage_queue_secret';`
Nothing else needs changing.

### Verify

```sql
select jobname, schedule, command, active from cron.job where jobname = 'purge-storage-queue';
```

Trigger a run without waiting for 02:47:

```sql
select public.invoke_purge_storage_queue();   -- returns the pg_net request id
```

A few seconds later, read the response. A healthy run is status 200 with a body like
`{"batches":0,"removed":0,"alreadyAbsent":0,"failed":0}`; 401 means the header did
not match the Vault secret, 500 means the function could not reach the database
(see the function logs), 404 means the function is not deployed.

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
