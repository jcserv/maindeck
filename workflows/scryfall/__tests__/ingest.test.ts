import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: "test-run-id" }),
}));

vi.mock("../steps", () => ({
  SCRYFALL_SOURCE: "scryfall:default_cards",
  fetchBulkManifest: vi.fn(),
  getLastCheckpoint: vi.fn(),
  acquireIngestLock: vi.fn(),
  releaseIngestLock: vi.fn(),
  downloadAndStage: vi.fn(),
  upsertBatch: vi.fn(),
  ingestCollectorPrintings: vi.fn(),
  commitScryfallCheckpoint: vi.fn(),
  cleanupStaging: vi.fn(),
}));

import {
  acquireIngestLock,
  cleanupStaging,
  commitScryfallCheckpoint,
  downloadAndStage,
  fetchBulkManifest,
  getLastCheckpoint,
  ingestCollectorPrintings,
  releaseIngestLock,
  SCRYFALL_SOURCE,
  upsertBatch,
} from "../steps";
import { scryfallIngestWorkflow } from "../ingest";

const mockedFetch = vi.mocked(fetchBulkManifest);
const mockedGetCheckpoint = vi.mocked(getLastCheckpoint);
const mockedAcquireLock = vi.mocked(acquireIngestLock);
const mockedReleaseLock = vi.mocked(releaseIngestLock);
const mockedDownload = vi.mocked(downloadAndStage);
const mockedUpsert = vi.mocked(upsertBatch);
const mockedIngestJp = vi.mocked(ingestCollectorPrintings);
const mockedCommit = vi.mocked(commitScryfallCheckpoint);
const mockedCleanup = vi.mocked(cleanupStaging);

function emptyBatchStats() {
  return {
    cardsInserted: 0,
    cardsUpdated: 0,
    cardsUnchanged: 0,
    printingsInserted: 0,
    printingsUpdated: 0,
    printingsUnchanged: 0,
    printingsFailed: 0,
    skipped: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpsert.mockResolvedValue(emptyBatchStats());
  mockedIngestJp.mockResolvedValue(emptyBatchStats());
  mockedCommit.mockResolvedValue(undefined);
  mockedCleanup.mockResolvedValue(undefined);
  mockedAcquireLock.mockResolvedValue(true);
  mockedReleaseLock.mockResolvedValue(undefined);
});

describe("scryfallIngestWorkflow", () => {
  it("skips when manifest updatedAt matches the last checkpoint", async () => {
    mockedFetch.mockResolvedValue({
      downloadUri: "https://d.example/file.json",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    mockedGetCheckpoint.mockResolvedValue("2026-01-01T00:00:00Z");

    const result = await scryfallIngestWorkflow();

    expect(result).toEqual({
      skipped: true,
      reason: "manifest unchanged",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    expect(mockedGetCheckpoint).toHaveBeenCalledWith(SCRYFALL_SOURCE);
    expect(mockedDownload).not.toHaveBeenCalled();
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedCommit).not.toHaveBeenCalled();
    expect(mockedCleanup).not.toHaveBeenCalled();
  });

  it("runs the full pipeline when checkpoint differs and writes checkpoint last", async () => {
    mockedFetch.mockResolvedValue({
      downloadUri: "https://d.example/file.json",
      updatedAt: "2026-02-02T00:00:00Z",
    });
    mockedGetCheckpoint.mockResolvedValue("2026-01-01T00:00:00Z");
    mockedDownload.mockResolvedValue({ totalBatches: 2, filterSkipped: 3 });

    const callOrder: string[] = [];
    mockedDownload.mockImplementationOnce(async () => {
      callOrder.push("download");
      return { totalBatches: 2, filterSkipped: 3 };
    });
    mockedUpsert.mockImplementation(async () => {
      callOrder.push("upsert");
      return emptyBatchStats();
    });
    mockedIngestJp.mockImplementation(async () => {
      callOrder.push("ingestCollectorPrintings");
      return emptyBatchStats();
    });
    mockedCommit.mockImplementation(async () => {
      callOrder.push("commitScryfallCheckpoint");
    });
    mockedCleanup.mockImplementation(async () => {
      callOrder.push("cleanup");
    });

    const result = await scryfallIngestWorkflow();

    expect(mockedDownload).toHaveBeenCalledWith(
      "https://d.example/file.json",
      "test-run-id",
    );
    expect(mockedUpsert).toHaveBeenCalledTimes(2);
    expect(mockedUpsert).toHaveBeenNthCalledWith(1, "test-run-id", 0, 2);
    expect(mockedUpsert).toHaveBeenNthCalledWith(2, "test-run-id", 1, 2);
    expect(mockedCommit).toHaveBeenCalledWith(
      SCRYFALL_SOURCE,
      "2026-02-02T00:00:00Z",
    );
    expect(mockedCleanup).toHaveBeenCalledWith("test-run-id", 2);

    expect(callOrder).toEqual([
      "download",
      "upsert",
      "upsert",
      "ingestCollectorPrintings",
      "commitScryfallCheckpoint",
      "cleanup",
    ]);

    expect(result).toMatchObject({
      updatedAt: "2026-02-02T00:00:00Z",
      skipped: 3,
    });
    expect(mockedAcquireLock).toHaveBeenCalledWith(
      SCRYFALL_SOURCE,
      "test-run-id",
    );
    expect(mockedReleaseLock).toHaveBeenCalledWith(
      SCRYFALL_SOURCE,
      "test-run-id",
    );
  });

  it("does not write checkpoint when a batch fails, but still cleans up staging", async () => {
    mockedFetch.mockResolvedValue({
      downloadUri: "https://d.example/file.json",
      updatedAt: "2026-03-03T00:00:00Z",
    });
    mockedGetCheckpoint.mockResolvedValue(null);
    mockedDownload.mockResolvedValue({ totalBatches: 2, filterSkipped: 0 });
    mockedUpsert
      .mockResolvedValueOnce(emptyBatchStats())
      .mockRejectedValueOnce(new Error("db down"));

    await expect(scryfallIngestWorkflow()).rejects.toThrow("db down");

    expect(mockedCommit).not.toHaveBeenCalled();
    expect(mockedCleanup).toHaveBeenCalledWith("test-run-id", 2);
    expect(mockedReleaseLock).toHaveBeenCalledWith(
      SCRYFALL_SOURCE,
      "test-run-id",
    );
  });

  it("skips when another run holds the ingest lock", async () => {
    mockedFetch.mockResolvedValue({
      downloadUri: "https://d.example/file.json",
      updatedAt: "2026-04-04T00:00:00Z",
    });
    mockedGetCheckpoint.mockResolvedValue("2026-01-01T00:00:00Z");
    mockedAcquireLock.mockResolvedValue(false);

    const result = await scryfallIngestWorkflow();

    expect(result).toEqual({
      skipped: true,
      reason: "another ingest run holds the lock",
      updatedAt: "2026-04-04T00:00:00Z",
    });
    expect(mockedDownload).not.toHaveBeenCalled();
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedCommit).not.toHaveBeenCalled();
    expect(mockedCleanup).not.toHaveBeenCalled();
    expect(mockedReleaseLock).not.toHaveBeenCalled();
  });
});
