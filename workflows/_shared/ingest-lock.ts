import { prisma } from "@/lib/db";

// Ingest can run for many minutes; this gates how long another run will wait
// before assuming the holder crashed and stealing the lock.
export const INGEST_LOCK_STALE_MS = 30 * 60_000;

// Returns true if this workflow now holds the lock. A stale lock (older than
// INGEST_LOCK_STALE_MS) is stolen — the prior holder either crashed or its
// step retries are no longer making progress.
//
// Memoization caveat (workflow event-sourcing): this is a step, so its
// `{acquired: true}` result is recorded in the run's event log on first
// success and replayed on resume — the workflow function will NOT re-run the
// DB insert on a replay. If the workflow process crashes after this step
// returns but before `releaseIngestLock` runs, the stale-lock window
// (`INGEST_LOCK_STALE_MS`, currently 30 min) is the only recovery path.
// See `node_modules/workflow/docs/how-it-works/event-sourcing.mdx`.
export async function acquireIngestLock(
  source: string,
  workflowId: string,
): Promise<boolean> {
  "use step";
  try {
    await prisma.ingestLock.create({ data: { source, workflowId } });
    return true;
  } catch {
    const staleBefore = new Date(Date.now() - INGEST_LOCK_STALE_MS);
    const { count } = await prisma.ingestLock.updateMany({
      where: { source, acquiredAt: { lt: staleBefore } },
      data: { workflowId, acquiredAt: new Date() },
    });
    return count > 0;
  }
}

// Releasing by `(source, workflowId)` is intentionally narrow: if our lock
// was stolen as stale by a later run, the steal updated `workflowId` to the
// thief's, so this delete becomes a no-op and we don't yank out the row from
// under the new holder. The thief's own `releaseIngestLock` will clean up.
export async function releaseIngestLock(
  source: string,
  workflowId: string,
): Promise<void> {
  "use step";
  await prisma.ingestLock.deleteMany({ where: { source, workflowId } });
}
