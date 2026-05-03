import { FatalError, getWorkflowMetadata } from "workflow";
import {
  acquireIngestLock,
  getLastCheckpoint,
  releaseIngestLock,
  writeCheckpoint,
} from "@/workflows/scryfall/steps";
import {
  cleanupPreconStaging,
  downloadAndStagePrecons,
  emptyPreconStats,
  fetchPreconManifest,
  invalidateDeckDiscoveryCache,
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
  const acquired = await acquireIngestLock(PRECON_SOURCE, workflowRunId);
  if (!acquired) {
    return {
      skipped: true as const,
      reason: "another ingest run holds the lock",
      version: manifest.version,
    };
  }

  let totalBatches = 0;
  try {
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
      const batchStats = await upsertPreconBatch(workflowRunId, i);
      stats.decksInserted += batchStats.decksInserted;
      stats.decksUpdated += batchStats.decksUpdated;
      stats.decksUnchanged += batchStats.decksUnchanged;
      stats.decksFailed += batchStats.decksFailed;
      stats.cardsUnmatched += batchStats.cardsUnmatched;
    }

    await writeCheckpoint(PRECON_SOURCE, manifest.version);
    await invalidateDeckDiscoveryCache();

    return { version: manifest.version, ...stats };
  } finally {
    await cleanupPreconStaging(workflowRunId, totalBatches);
    await releaseIngestLock(PRECON_SOURCE, workflowRunId);
  }
}
