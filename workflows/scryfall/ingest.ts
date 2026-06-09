import { getWorkflowMetadata } from "workflow";
import { logWarn } from "@/lib/telemetry";
import {
  acquireIngestLock,
  cleanupStaging,
  commitScryfallCheckpoint,
  downloadAndStage,
  fetchBulkManifest,
  getLastCheckpoint,
  ingestCollectorPrintings,
  type IngestStats,
  releaseIngestLock,
  SCRYFALL_SOURCE,
  upsertBatch,
} from "./steps";

export async function scryfallIngestWorkflow() {
  "use workflow";
  const manifest = await fetchBulkManifest();
  const lastUpdatedAt = await getLastCheckpoint(SCRYFALL_SOURCE);
  if (lastUpdatedAt === manifest.updatedAt) {
    return {
      skipped: true as const,
      reason: "manifest unchanged",
      updatedAt: manifest.updatedAt,
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
    acquired = await acquireIngestLock(SCRYFALL_SOURCE, workflowRunId);
    if (!acquired) {
      return {
        skipped: true as const,
        reason: "another ingest run holds the lock",
        updatedAt: manifest.updatedAt,
      };
    }

    const result = await downloadAndStage(manifest.downloadUri, workflowRunId);
    totalBatches = result.totalBatches;

    const stats: IngestStats = {
      cardsInserted: 0,
      cardsUpdated: 0,
      cardsUnchanged: 0,
      printingsInserted: 0,
      printingsUpdated: 0,
      printingsUnchanged: 0,
      printingsFailed: 0,
      skipped: result.filterSkipped,
    };

    for (let i = 0; i < totalBatches; i++) {
      const batchStats = await upsertBatch(workflowRunId, i, totalBatches);
      stats.cardsInserted += batchStats.cardsInserted;
      stats.cardsUpdated += batchStats.cardsUpdated;
      stats.cardsUnchanged += batchStats.cardsUnchanged;
      stats.printingsInserted += batchStats.printingsInserted;
      stats.printingsUpdated += batchStats.printingsUpdated;
      stats.printingsUnchanged += batchStats.printingsUnchanged;
      stats.printingsFailed += batchStats.printingsFailed;
      stats.skipped += batchStats.skipped;
    }

    // Enrich with curated Japanese collector printings via the search API.
    // Cards are guaranteed present (bulk upsert above completed). This is a
    // best-effort step: a search outage must not strand the checkpoint, or the
    // next cron sees the manifest changed and re-downloads the full ~500MB bulk.
    // Mirror `cleanupStaging`: log + continue so `commitScryfallCheckpoint` runs.
    try {
      const jpStats = await ingestCollectorPrintings();
      stats.printingsInserted += jpStats.printingsInserted;
      stats.printingsUpdated += jpStats.printingsUpdated;
      stats.printingsUnchanged += jpStats.printingsUnchanged;
      stats.printingsFailed += jpStats.printingsFailed;
      stats.skipped += jpStats.skipped;
    } catch (err) {
      logWarn(
        { source: "scryfall.ingest", workflowRunId },
        "ingestCollectorPrintings failed; committing checkpoint without JP enrichment",
        err,
      );
    }

    // Single atomic step so cache-invalidate failures don't strand the
    // checkpoint ahead of a stale cache. See `commitScryfallCheckpoint`.
    await commitScryfallCheckpoint(SCRYFALL_SOURCE, manifest.updatedAt);

    return { updatedAt: manifest.updatedAt, ...stats };
  } finally {
    // Release the lock FIRST — it's a cheap one-row delete that must succeed
    // for the next cron tick to acquire. `cleanupStaging` is best-effort;
    // wrap it so a failure logs but doesn't re-throw and skip the release.
    if (acquired) {
      await releaseIngestLock(SCRYFALL_SOURCE, workflowRunId);
      // Only attempt cleanup if we actually acquired the lock and might have
      // staged batches — the lock-not-acquired branch never reached
      // `downloadAndStage` and has nothing to clean up.
      try {
        await cleanupStaging(workflowRunId, totalBatches);
      } catch (err) {
        logWarn(
          { source: "scryfall.ingest", workflowRunId, totalBatches },
          "cleanupStaging failed; leaving stage blobs for next run",
          err,
        );
      }
    }
  }
}
