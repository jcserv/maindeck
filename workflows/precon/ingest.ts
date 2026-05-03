import { FatalError, getWorkflowMetadata } from "workflow";
import { logWarn } from "@/lib/telemetry";
import {
  acquireIngestLock,
  getLastCheckpoint,
  releaseIngestLock,
} from "@/workflows/_shared";
import {
  cleanupPreconStaging,
  commitPreconCheckpoint,
  downloadAndStagePrecons,
  emptyPreconStats,
  fetchPreconManifest,
  PRECON_SOURCE,
  type PreconBatchStats,
  scryfallCheckpointFreshEnough,
  upsertPreconBatch,
} from "./steps";

export async function preconIngestWorkflow() {
  "use workflow";
  const manifest = await fetchPreconManifest();
  const lastVersion = await getLastCheckpoint(PRECON_SOURCE);
  if (lastVersion === manifest.version) {
    return {
      skipped: true as const,
      reason: "manifest unchanged",
      version: manifest.version,
    };
  }

  const scryfallReady = await scryfallCheckpointFreshEnough();
  if (!scryfallReady) {
    return {
      skipped: true as const,
      reason: "scryfall ingest too stale",
      version: manifest.version,
    };
  }

  const { workflowRunId } = getWorkflowMetadata();

  // `acquireIngestLock` is inside the try so the `finally` below is guaranteed
  // to run on every code path that reaches the acquire — even a runtime panic
  // between the acquire and the first user-land statement. Without this,
  // a sandbox-level failure (process kill, OOM) would leak the lock row until
  // `INGEST_LOCK_STALE_MS` (30 min) elapsed.
  // See `node_modules/workflow/docs/foundations/errors-and-retries.mdx` (lines 170–227).
  let acquired = false;
  let totalBatches = 0;
  try {
    acquired = await acquireIngestLock(PRECON_SOURCE, workflowRunId);
    if (!acquired) {
      return {
        skipped: true as const,
        reason: "another ingest run holds the lock",
        version: manifest.version,
      };
    }

    const result = await downloadAndStagePrecons(
      manifest.deckIndex,
      workflowRunId,
    );
    totalBatches = result.totalBatches;

    if (totalBatches === 0 && result.failedFetches > 0) {
      throw new FatalError(
        `precon ingest aborted: every fetch failed (${result.failedFetches}). ` +
          `Refusing to advance the checkpoint with zero decks staged.`,
      );
    }

    const stats: PreconBatchStats & { failedFetches: number } = {
      ...emptyPreconStats(),
      failedFetches: result.failedFetches,
    };

    for (let i = 0; i < totalBatches; i++) {
      const batchStats = await upsertPreconBatch(workflowRunId, i, totalBatches);
      stats.decksInserted += batchStats.decksInserted;
      stats.decksUpdated += batchStats.decksUpdated;
      stats.decksUnchanged += batchStats.decksUnchanged;
      stats.decksFailed += batchStats.decksFailed;
      stats.cardsUnmatched += batchStats.cardsUnmatched;
    }

    // Single atomic step so cache-invalidate failures don't strand the
    // checkpoint ahead of stale discovery caches. See `commitPreconCheckpoint`.
    await commitPreconCheckpoint(PRECON_SOURCE, manifest.version);

    return { version: manifest.version, ...stats };
  } finally {
    // Release the lock FIRST — it's a cheap one-row delete that must succeed
    // for the next cron tick to acquire. `cleanupPreconStaging` is best-effort;
    // wrap it so a failure logs but doesn't re-throw and skip the release.
    if (acquired) {
      await releaseIngestLock(PRECON_SOURCE, workflowRunId);
      try {
        await cleanupPreconStaging(workflowRunId, totalBatches);
      } catch (err) {
        logWarn(
          { source: "precon.ingest", workflowRunId, totalBatches },
          "cleanupPreconStaging failed; leaving stage blobs for next run",
          err,
        );
      }
    }
  }
}
