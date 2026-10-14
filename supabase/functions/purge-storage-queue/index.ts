// Removes the files of purged accounts from Storage.
//
// purge_deleted_accounts() (migration 33) cannot delete storage objects from SQL,
// so it records bucket and path in public.account_purge_storage_queue. This
// function empties that queue with the service role: it reads pending rows in
// batches of 100 (oldest first), removes them per bucket through the Storage API,
// and stamps removed_at on the rows whose file is gone. Anything that fails is
// logged and left pending for the next run.
//
// "Gone" means one of two things: remove() reported the object as deleted, or a
// follow-up check says it no longer exists (removed by hand, or removed on an
// earlier run that failed before it could stamp the row). Without the second case
// such a row would stay pending for ever.
//
// Called once a day by pg_cron through pg_net (migration 35). Deployed with
// --no-verify-jwt: the caller proves itself with a shared secret in the
// x-purge-secret header, which must equal the PURGE_STORAGE_QUEUE_SECRET function
// secret. See supabase/functions/README.md.
//
// Logs carry queue row ids, never object paths: the paths contain user ids and
// original file names, which the purge treats as personal data.

import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const BATCH_SIZE = 100;
// Bounds one invocation: at most this many batches, and no new batch is started
// after the time budget. Whatever is left is picked up on the next run.
const MAX_BATCHES = 10;
const TIME_BUDGET_MS = 60_000;

interface QueueRow {
  id: string;
  bucket_id: string;
  object_name: string;
  queued_at: string;
}

interface Summary {
  batches: number;
  removed: number;
  alreadyAbsent: number;
  failed: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Constant-time comparison, so the secret cannot be guessed a byte at a time.
function secretsMatch(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a[i] ?? 0) ^ b[i];
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("PURGE_STORAGE_QUEUE_SECRET") ?? "";
  if (expected.length < 32) {
    console.error("purge-storage-queue: PURGE_STORAGE_QUEUE_SECRET is not set (or shorter than 32 characters)");
    return json({ error: "Not configured" }, 500);
  }
  if (!secretsMatch(req.headers.get("x-purge-secret") ?? "", expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("purge-storage-queue: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return json({ error: "Not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const started = Date.now();
  const summary: Summary = { batches: 0, removed: 0, alreadyAbsent: 0, failed: 0 };
  // Keyset cursor. Rows that fail stay pending, so paging by "removed_at is null"
  // alone would fetch them again in the same run. One purge run queues all its
  // rows with the same queued_at (now() is the transaction start), hence the id
  // tiebreaker.
  let cursor: { queuedAt: string; id: string } | null = null;

  while (summary.batches < MAX_BATCHES && Date.now() - started < TIME_BUDGET_MS) {
    let query = supabase
      .from("account_purge_storage_queue")
      .select("id, bucket_id, object_name, queued_at")
      .is("removed_at", null)
      .order("queued_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);
    if (cursor) {
      query = query.or(
        `queued_at.gt."${cursor.queuedAt}",and(queued_at.eq."${cursor.queuedAt}",id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error(`purge-storage-queue: reading the queue failed: ${error.message}`);
      return json({ ...summary, error: "Reading the queue failed" }, 500);
    }
    const rows = (data ?? []) as QueueRow[];
    if (rows.length === 0) break;
    summary.batches++;
    const last = rows[rows.length - 1];
    cursor = { queuedAt: last.queued_at, id: last.id };

    // bucket -> object name -> queue row ids (the same file may be queued twice).
    const byBucket = new Map<string, Map<string, string[]>>();
    for (const row of rows) {
      let names = byBucket.get(row.bucket_id);
      if (!names) byBucket.set(row.bucket_id, (names = new Map()));
      const ids = names.get(row.object_name);
      if (ids) ids.push(row.id);
      else names.set(row.object_name, [row.id]);
    }

    const doneIds: string[] = [];
    for (const [bucketId, names] of byBucket) {
      const bucket = supabase.storage.from(bucketId);
      const { data: removed, error: removeError } = await bucket.remove([...names.keys()]);
      if (removeError) {
        const ids = [...names.values()].flat();
        summary.failed += ids.length;
        console.error(
          `purge-storage-queue: remove() in bucket ${bucketId} failed for ${ids.length} row(s) (${ids.join(", ")}): ${removeError.message}`,
        );
        continue;
      }

      const removedNames = new Set((removed ?? []).map((object) => object.name));
      for (const [name, ids] of names) {
        if (removedNames.has(name)) {
          doneIds.push(...ids);
          summary.removed += ids.length;
          continue;
        }
        // Not reported as removed: find out whether it is already gone.
        try {
          const { data: exists, error: existsError } = await bucket.exists(name);
          if (!exists && existsError) {
            doneIds.push(...ids);
            summary.alreadyAbsent += ids.length;
            console.log(`purge-storage-queue: row(s) ${ids.join(", ")}: object already absent`);
          } else {
            summary.failed += ids.length;
            console.error(`purge-storage-queue: row(s) ${ids.join(", ")}: object still present after remove()`);
          }
        } catch (err) {
          summary.failed += ids.length;
          console.error(
            `purge-storage-queue: row(s) ${ids.join(", ")}: existence check failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (doneIds.length > 0) {
      const { error: stampError } = await supabase
        .from("account_purge_storage_queue")
        .update({ removed_at: new Date().toISOString() })
        .in("id", doneIds);
      if (stampError) {
        // The files are gone; the rows stay pending and the next run finds them
        // already absent and stamps them then.
        console.error(
          `purge-storage-queue: stamping removed_at on ${doneIds.length} row(s) failed: ${stampError.message}`,
        );
        return json({ ...summary, error: "Stamping removed_at failed" }, 500);
      }
    }

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`purge-storage-queue: ${JSON.stringify(summary)}`);
  return json(summary);
});
