import { getWorkflowMetadata } from "workflow";
import {
  cleanupStaging,
  downloadAndStage,
  fetchBulkManifest,
  type IngestStats,
  upsertBatch,
} from "./steps";

export async function scryfallIngestWorkflow() {
  "use workflow";
  const manifest = await fetchBulkManifest();
  const { workflowRunId } = getWorkflowMetadata();

  try {
    const { totalBatches, filterSkipped } = await downloadAndStage(
      manifest.downloadUri,
      workflowRunId,
    );

    const stats: IngestStats = {
      cardsInserted: 0,
      cardsUpdated: 0,
      cardsUnchanged: 0,
      printingsInserted: 0,
      printingsUpdated: 0,
      printingsUnchanged: 0,
      skipped: filterSkipped,
    };

    for (let i = 0; i < totalBatches; i++) {
      const batchStats = await upsertBatch(workflowRunId, i);
      stats.cardsInserted += batchStats.cardsInserted;
      stats.cardsUpdated += batchStats.cardsUpdated;
      stats.cardsUnchanged += batchStats.cardsUnchanged;
      stats.printingsInserted += batchStats.printingsInserted;
      stats.printingsUpdated += batchStats.printingsUpdated;
      stats.printingsUnchanged += batchStats.printingsUnchanged;
      stats.skipped += batchStats.skipped;
    }

    return { updatedAt: manifest.updatedAt, ...stats };
  } finally {
    await cleanupStaging(workflowRunId);
  }
}
