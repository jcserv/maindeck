import { getWorkflowMetadata } from "workflow";
import {
  acquireIngestLock,
  cleanupStaging,
  downloadAndStage,
  fetchBulkManifest,
  getLastCheckpoint,
  invalidateSearchCache,
  type IngestStats,
  releaseIngestLock,
  SCRYFALL_SOURCE,
  upsertBatch,
  writeCheckpoint,
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
  const acquired = await acquireIngestLock(SCRYFALL_SOURCE, workflowRunId);
  if (!acquired) {
    return {
      skipped: true as const,
      reason: "another ingest run holds the lock",
      updatedAt: manifest.updatedAt,
    };
  }

  let totalBatches = 0;
  try {
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
      const batchStats = await upsertBatch(workflowRunId, i);
      stats.cardsInserted += batchStats.cardsInserted;
      stats.cardsUpdated += batchStats.cardsUpdated;
      stats.cardsUnchanged += batchStats.cardsUnchanged;
      stats.printingsInserted += batchStats.printingsInserted;
      stats.printingsUpdated += batchStats.printingsUpdated;
      stats.printingsUnchanged += batchStats.printingsUnchanged;
      stats.printingsFailed += batchStats.printingsFailed;
      stats.skipped += batchStats.skipped;
    }

    await writeCheckpoint(SCRYFALL_SOURCE, manifest.updatedAt);
    await invalidateSearchCache();

    return { updatedAt: manifest.updatedAt, ...stats };
  } finally {
    await cleanupStaging(workflowRunId, totalBatches);
    await releaseIngestLock(SCRYFALL_SOURCE, workflowRunId);
  }
}
