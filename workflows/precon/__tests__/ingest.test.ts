import { beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

vi.mock("workflow", async () => {
  const actual = await vi.importActual<typeof import("workflow")>("workflow");
  return {
    ...actual,
    getWorkflowMetadata: () => ({ workflowRunId: "test-run-id" }),
  };
});

vi.mock("@/workflows/_shared", () => ({
  acquireIngestLock: vi.fn(),
  releaseIngestLock: vi.fn(),
  getLastCheckpoint: vi.fn(),
}));

vi.mock("../steps", () => ({
  PRECON_SOURCE: "mtgjson:decks",
  emptyPreconStats: () => ({
    decksInserted: 0,
    decksUpdated: 0,
    decksUnchanged: 0,
    decksFailed: 0,
    cardsUnmatched: 0,
  }),
  fetchPreconManifest: vi.fn(),
  scryfallCheckpointFreshEnough: vi.fn(),
  downloadAndStagePrecons: vi.fn(),
  upsertPreconBatch: vi.fn(),
  cleanupPreconStaging: vi.fn(),
  commitPreconCheckpoint: vi.fn(),
}));

import {
  acquireIngestLock,
  getLastCheckpoint,
  releaseIngestLock,
} from "@/workflows/_shared";
import { preconIngestWorkflow } from "../ingest";
import {
  cleanupPreconStaging,
  commitPreconCheckpoint,
  downloadAndStagePrecons,
  fetchPreconManifest,
  scryfallCheckpointFreshEnough,
  upsertPreconBatch,
} from "../steps";

const mockedManifest = vi.mocked(fetchPreconManifest);
const mockedFresh = vi.mocked(scryfallCheckpointFreshEnough);
const mockedGetCheckpoint = vi.mocked(getLastCheckpoint);
const mockedAcquireLock = vi.mocked(acquireIngestLock);
const mockedReleaseLock = vi.mocked(releaseIngestLock);
const mockedDownload = vi.mocked(downloadAndStagePrecons);
const mockedUpsert = vi.mocked(upsertPreconBatch);
const mockedCommit = vi.mocked(commitPreconCheckpoint);
const mockedCleanup = vi.mocked(cleanupPreconStaging);

beforeEach(() => {
  vi.clearAllMocks();
  mockedFresh.mockResolvedValue(true);
  mockedAcquireLock.mockResolvedValue(true);
  mockedReleaseLock.mockResolvedValue(undefined);
  mockedCommit.mockResolvedValue(undefined);
  mockedCleanup.mockResolvedValue(undefined);
  mockedUpsert.mockResolvedValue({
    decksInserted: 0,
    decksUpdated: 0,
    decksUnchanged: 0,
    decksFailed: 0,
    cardsUnmatched: 0,
  });
});

describe("preconIngestWorkflow", () => {
  it("aborts with a FatalError when every fetch fails, leaving the checkpoint untouched", async () => {
    mockedManifest.mockResolvedValue({
      version: "5.3.0+20260502",
      deckIndex: [
        { code: "A", fileName: "A_X", name: "A", releaseDate: "2026-01-01" },
      ],
    });
    mockedGetCheckpoint.mockResolvedValue(null);
    mockedDownload.mockResolvedValue({
      totalBatches: 0,
      failedFetches: 2728,
      skippedNonPlayable: 0,
    });

    await expect(preconIngestWorkflow()).rejects.toBeInstanceOf(FatalError);

    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedCommit).not.toHaveBeenCalled();
    // finally block still cleans up and releases the lock; with the new
    // ordering (release first, then cleanup) both still run.
    expect(mockedReleaseLock).toHaveBeenCalledWith(
      "mtgjson:decks",
      "test-run-id",
    );
    expect(mockedCleanup).toHaveBeenCalledWith("test-run-id", 0);
    // Release runs before cleanup so a cleanup failure can't strand the lock.
    const releaseOrder = mockedReleaseLock.mock.invocationCallOrder[0]!;
    const cleanupOrder = mockedCleanup.mock.invocationCallOrder[0]!;
    expect(releaseOrder).toBeLessThan(cleanupOrder);
  });

  it("does not abort when the deck index is empty (zero fetches attempted)", async () => {
    mockedManifest.mockResolvedValue({
      version: "5.3.0+20260502",
      deckIndex: [],
    });
    mockedGetCheckpoint.mockResolvedValue(null);
    mockedDownload.mockResolvedValue({
      totalBatches: 0,
      failedFetches: 0,
      skippedNonPlayable: 0,
    });

    const result = await preconIngestWorkflow();

    expect(result).toMatchObject({ version: "5.3.0+20260502" });
    expect(mockedCommit).toHaveBeenCalledWith(
      "mtgjson:decks",
      "5.3.0+20260502",
    );
  });

  it("runs the full pipeline when batches stage successfully", async () => {
    mockedManifest.mockResolvedValue({
      version: "5.3.0+20260502",
      deckIndex: [
        { code: "A", fileName: "A_X", name: "A", releaseDate: "2026-01-01" },
      ],
    });
    mockedGetCheckpoint.mockResolvedValue(null);
    mockedDownload.mockResolvedValue({
      totalBatches: 2,
      failedFetches: 0,
      skippedNonPlayable: 0,
    });

    await preconIngestWorkflow();

    expect(mockedUpsert).toHaveBeenCalledTimes(2);
    expect(mockedUpsert).toHaveBeenNthCalledWith(1, "test-run-id", 0, 2);
    expect(mockedUpsert).toHaveBeenNthCalledWith(2, "test-run-id", 1, 2);
    expect(mockedCommit).toHaveBeenCalledWith(
      "mtgjson:decks",
      "5.3.0+20260502",
    );
    expect(mockedCleanup).toHaveBeenCalledWith("test-run-id", 2);
  });
});
