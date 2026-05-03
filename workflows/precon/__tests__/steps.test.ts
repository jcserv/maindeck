import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { intakeDecklist } from "@/lib/deck/io/intake";
import { getBatchStorage } from "@/lib/staging";
import { logInfo } from "@/lib/telemetry";
import {
  cleanupPreconStaging,
  downloadAndStagePrecons,
  fetchPreconManifest,
  invalidateDeckDiscoveryCache,
  type PreconDeckBatch,
  scryfallCheckpointFreshEnough,
  upsertPreconBatch,
} from "../steps";

vi.mock("@/lib/db", () => {
  const prismaMock: Record<string, unknown> = {
    deck: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ingestDeckFailure: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    ingestCheckpoint: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: prismaMock };
});

vi.mock("@/lib/staging", () => ({
  getBatchStorage: vi.fn(),
}));

vi.mock("@/lib/deck/io/intake", () => ({
  intakeDecklist: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

const mockedPrisma = vi.mocked(prisma, true);
const mockedGetStorage = vi.mocked(getBatchStorage);
const mockedIntake = vi.mocked(intakeDecklist);
const mockedRevalidateTag = vi.mocked(revalidateTag);
const mockedLogInfo = vi.mocked(logInfo);

type FakeStorage = {
  writeBatch: ReturnType<typeof vi.fn>;
  readBatch: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
};

function fakeStorage(): FakeStorage {
  return {
    writeBatch: vi.fn().mockResolvedValue(undefined),
    readBatch: vi.fn(),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBatchEntry(overrides: Partial<PreconDeckBatch> = {}): PreconDeckBatch {
  return {
    code: "TST-001",
    name: "Test Precon",
    releaseDate: "2026-01-01",
    type: "Commander Deck",
    contentHash: "hash-A",
    decklistText: "// Commander\n1 Atraxa\n// Mainboard\n1 Sol Ring\n",
    ...overrides,
  };
}

let storage: FakeStorage;

beforeEach(() => {
  vi.clearAllMocks();
  storage = fakeStorage();
  mockedGetStorage.mockReturnValue(storage as never);

  mockedPrisma.deck.findUnique.mockResolvedValue(null as never);
  mockedPrisma.deck.upsert.mockResolvedValue({ id: "deck-1" } as never);
  mockedPrisma.deck.update.mockResolvedValue({} as never);
  mockedPrisma.deck.updateMany.mockResolvedValue({ count: 0 } as never);
  mockedPrisma.ingestDeckFailure.upsert.mockResolvedValue({} as never);
  mockedPrisma.ingestDeckFailure.updateMany.mockResolvedValue({ count: 0 } as never);
  mockedPrisma.ingestCheckpoint.findUnique.mockResolvedValue(null as never);

  mockedIntake.mockResolvedValue({
    applied: 2,
    added: 2,
    removed: 0,
    updated: 0,
    unmatchedNames: [],
    warnings: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("upsertPreconBatch", () => {
  it("inserts a new deck (no existing row)", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry()]);

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats).toEqual({
      decksInserted: 1,
      decksUpdated: 0,
      decksUnchanged: 0,
      decksFailed: 0,
      cardsUnmatched: 0,
    });
    expect(mockedPrisma.deck.upsert).toHaveBeenCalledTimes(1);
    expect(mockedIntake).toHaveBeenCalledTimes(1);
    expect(mockedIntake.mock.calls[0]?.[0]).toMatchObject({
      mode: "replace",
      applyOptions: { skipRevision: true, skipCacheInvalidation: true },
    });
  });

  it("counts as updated when existing row has different hash", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry()]);
    mockedPrisma.deck.findUnique.mockResolvedValueOnce({
      id: "deck-1",
      externalVersion: "hash-OLD",
    } as never);

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats.decksUpdated).toBe(1);
    expect(stats.decksInserted).toBe(0);
    expect(mockedIntake).toHaveBeenCalledTimes(1);
  });

  it("skips intake when the content hash matches", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry({ contentHash: "hash-SAME" })]);
    mockedPrisma.deck.findUnique.mockResolvedValueOnce({
      id: "deck-1",
      externalVersion: "hash-SAME",
    } as never);

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats).toEqual({
      decksInserted: 0,
      decksUpdated: 0,
      decksUnchanged: 1,
      decksFailed: 0,
      cardsUnmatched: 0,
    });
    expect(mockedPrisma.deck.upsert).not.toHaveBeenCalled();
    expect(mockedIntake).not.toHaveBeenCalled();
  });

  it("records a failure and rolls externalVersion back when intake reports unmatched cards", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry()]);
    mockedIntake.mockResolvedValueOnce({
      applied: 0,
      added: 0,
      removed: 0,
      updated: 0,
      unmatchedNames: ["Made-Up Card", "Another Missing"],
      warnings: [],
    });

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats.decksFailed).toBe(1);
    expect(stats.cardsUnmatched).toBe(2);
    // externalVersion rolled back to null so the next run retries.
    expect(mockedPrisma.deck.update).toHaveBeenCalledWith({
      where: { id: "deck-1" },
      data: { externalVersion: null },
    });
    expect(mockedPrisma.ingestDeckFailure.upsert).toHaveBeenCalledTimes(1);
    const failureCall = mockedPrisma.ingestDeckFailure.upsert.mock.calls[0]?.[0] as {
      create?: { reason?: string; details?: { unmatched?: unknown[] } };
    };
    expect(failureCall?.create?.reason).toBe("unmatched_cards");
    expect(failureCall?.create?.details?.unmatched).toEqual([
      "Made-Up Card",
      "Another Missing",
    ]);
  });

  it("records a failure and continues the batch when one deck throws", async () => {
    storage.readBatch.mockResolvedValueOnce([
      makeBatchEntry({ code: "BAD-1" }),
      makeBatchEntry({ code: "OK-1", contentHash: "hash-B" }),
    ]);
    mockedPrisma.deck.upsert
      .mockRejectedValueOnce(new Error("db kaboom"))
      .mockResolvedValueOnce({ id: "deck-2" } as never);

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats.decksFailed).toBe(1);
    expect(stats.decksInserted).toBe(1);
    expect(mockedPrisma.ingestDeckFailure.upsert).toHaveBeenCalledTimes(1);
    const failureCall = mockedPrisma.ingestDeckFailure.upsert.mock.calls[0]?.[0] as {
      create?: { externalId?: string; reason?: string };
    };
    expect(failureCall?.create?.externalId).toBe("BAD-1");
    expect(failureCall?.create?.reason).toBe("exception");
  });

  it("rolls externalVersion back when intake throws after the deck row was upserted", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry({ code: "BOOM" })]);
    mockedIntake.mockRejectedValueOnce(new Error("intake kaboom"));

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats.decksFailed).toBe(1);
    // Without this rollback, the next run would see a matching contentHash on
    // a deck that has no cards and skip it as "unchanged".
    expect(mockedPrisma.deck.updateMany).toHaveBeenCalledWith({
      where: { externalSource: "mtgjson", externalId: "BOOM" },
      data: { externalVersion: null },
    });
  });

  it("marks prior failures resolved on a successful re-ingest", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry()]);

    await upsertPreconBatch("run1", 0);

    expect(mockedPrisma.ingestDeckFailure.updateMany).toHaveBeenCalledWith({
      where: { source: "mtgjson", externalId: "TST-001", resolved: false },
      data: { resolved: true },
    });
  });

  it("logs and continues when recording the failure also throws", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry({ code: "BOOM" })]);
    mockedPrisma.deck.upsert.mockRejectedValueOnce(new Error("db kaboom"));
    mockedPrisma.ingestDeckFailure.upsert.mockRejectedValueOnce(
      new Error("audit kaboom"),
    );

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats.decksFailed).toBe(1);
    expect(mockedPrisma.ingestDeckFailure.upsert).toHaveBeenCalledTimes(1);
  });

  it("logs and continues when the externalVersion rollback updateMany throws", async () => {
    storage.readBatch.mockResolvedValueOnce([makeBatchEntry({ code: "BOOM" })]);
    mockedPrisma.deck.upsert.mockRejectedValueOnce(new Error("db kaboom"));
    mockedPrisma.deck.updateMany.mockRejectedValueOnce(
      new Error("rollback kaboom"),
    );

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats.decksFailed).toBe(1);
    // Failure was still recorded even though the rollback path threw.
    expect(mockedPrisma.ingestDeckFailure.upsert).toHaveBeenCalledTimes(1);
  });

  it("backfills releasedAt on an unchanged deck when the prior row was missing it", async () => {
    storage.readBatch.mockResolvedValueOnce([
      makeBatchEntry({ contentHash: "hash-SAME", releaseDate: "2026-03-15" }),
    ]);
    mockedPrisma.deck.findUnique.mockResolvedValueOnce({
      id: "deck-1",
      externalVersion: "hash-SAME",
      releasedAt: null,
    } as never);

    const stats = await upsertPreconBatch("run1", 0);

    expect(stats.decksUnchanged).toBe(1);
    expect(mockedPrisma.deck.update).toHaveBeenCalledWith({
      where: { id: "deck-1" },
      data: { releasedAt: new Date("2026-03-15T00:00:00Z") },
    });
    expect(mockedPrisma.deck.upsert).not.toHaveBeenCalled();
  });
});

describe("fetchPreconManifest", () => {
  it("combines Meta version with the deck index", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { version: "5.2.3", date: "2026-04-01" } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                code: "TST",
                fileName: "Test_TST.json",
                name: "Test",
                releaseDate: "2026-01-01",
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const out = await fetchPreconManifest();
    expect(out.version).toBe("5.2.3");
    expect(out.deckIndex).toEqual([
      {
        code: "TST",
        fileName: "Test_TST.json",
        name: "Test",
        releaseDate: "2026-01-01",
      },
    ]);
  });
});

describe("scryfallCheckpointFreshEnough", () => {
  it("returns false when no checkpoint exists", async () => {
    mockedPrisma.ingestCheckpoint.findUnique.mockResolvedValueOnce(
      null as never,
    );
    expect(await scryfallCheckpointFreshEnough()).toBe(false);
  });

  it("returns true when ranAt is within the 14-day window", async () => {
    mockedPrisma.ingestCheckpoint.findUnique.mockResolvedValueOnce({
      ranAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    } as never);
    expect(await scryfallCheckpointFreshEnough()).toBe(true);
  });

  it("returns false when ranAt is older than the freshness window", async () => {
    mockedPrisma.ingestCheckpoint.findUnique.mockResolvedValueOnce({
      ranAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    } as never);
    expect(await scryfallCheckpointFreshEnough()).toBe(false);
  });
});

describe("downloadAndStagePrecons", () => {
  function deckBody(code: string, name = `Deck ${code}`): unknown {
    return {
      data: {
        code,
        name,
        type: "Commander Deck",
        releaseDate: "2026-01-01",
        commander: [{ name: "Atraxa, Praetors' Voice", count: 1 }],
        mainBoard: [
          { name: "Sol Ring", count: 1 },
          { name: "Swamp", count: 99 },
        ],
        sideBoard: [],
      },
    };
  }

  it("stages successful fetches in batches of 50 and counts failures", async () => {
    const entries = Array.from({ length: 51 }, (_, i) => ({
      code: `D-${i}`,
      fileName: `D_${i}.json`,
      name: `D ${i}`,
      releaseDate: "2026-01-01",
    }));

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        const match = url.match(/decks\/D_(\d+)\.json/);
        const i = match ? Number(match[1]) : -1;
        // First entry fetch fails (404, no retry on 4xx).
        if (i === 0) return new Response("", { status: 404 });
        return new Response(JSON.stringify(deckBody(`D-${i}`)), { status: 200 });
      });

    const out = await downloadAndStagePrecons(entries, "run-stage");

    expect(out.failedFetches).toBe(1);
    // 50 successes → one full batch of 50; the 51st entry failed.
    expect(out.totalBatches).toBe(1);
    expect(storage.writeBatch).toHaveBeenCalledTimes(1);
    const writeCall = storage.writeBatch.mock.calls[0]!;
    expect(writeCall[0]).toBe("run-stage");
    expect(writeCall[1]).toBe(0);
    expect((writeCall[2] as PreconDeckBatch[]).length).toBe(50);

    fetchSpy.mockRestore();
  });

  it("writes nothing when every fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 }),
    );

    const out = await downloadAndStagePrecons(
      [
        { code: "X", fileName: "X.json", name: "X", releaseDate: "2026-01-01" },
      ],
      "run-empty",
    );
    expect(out.failedFetches).toBe(1);
    expect(out.totalBatches).toBe(0);
    expect(storage.writeBatch).not.toHaveBeenCalled();
  });

  it("returns immediately on empty input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await downloadAndStagePrecons([], "run-zero");
    expect(out).toEqual({
      totalBatches: 0,
      failedFetches: 0,
      skippedNonPlayable: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.writeBatch).not.toHaveBeenCalled();
  });

  it("skips non-playable products (set checklists, promo bundles, tiny boxes)", async () => {
    const entries = [
      { code: "REAL", fileName: "Real.json", name: "Real", releaseDate: "2026-01-01" },
      { code: "FTV", fileName: "Ftv.json", name: "FTV", releaseDate: "2026-01-01" },
      { code: "REDM", fileName: "Redm.json", name: "Redm", releaseDate: "2026-01-01" },
      { code: "TINY", fileName: "Tiny.json", name: "Tiny", releaseDate: "2026-01-01" },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("Real.json")) {
        return new Response(JSON.stringify(deckBody("REAL")), { status: 200 });
      }
      if (url.endsWith("Ftv.json")) {
        return new Response(
          JSON.stringify({
            data: {
              code: "FTV",
              name: "From the Vault: Test",
              type: "From the Vault",
              releaseDate: "2026-01-01",
              commander: [],
              mainBoard: Array.from({ length: 15 }, (_, i) => ({
                name: `Card ${i}`,
                count: 1,
              })),
              sideBoard: [],
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("Redm.json")) {
        return new Response(
          JSON.stringify({
            data: {
              code: "REDM",
              name: "Foo Foil Redemption",
              type: "Foil Set",
              releaseDate: "2026-01-01",
              commander: [],
              mainBoard: Array.from({ length: 250 }, (_, i) => ({
                name: `Card ${i}`,
                count: 1,
              })),
              sideBoard: [],
            },
          }),
          { status: 200 },
        );
      }
      // TINY: allowed type but under the size floor.
      return new Response(
        JSON.stringify({
          data: {
            code: "TINY",
            name: "Welcome Booster",
            type: "Welcome Deck",
            releaseDate: "2026-01-01",
            commander: [],
            mainBoard: Array.from({ length: 10 }, (_, i) => ({
              name: `Card ${i}`,
              count: 1,
            })),
            sideBoard: [],
          },
        }),
        { status: 200 },
      );
    });

    const out = await downloadAndStagePrecons(entries, "run-skip");

    expect(out.failedFetches).toBe(0);
    expect(out.skippedNonPlayable).toBe(3);
    expect(out.totalBatches).toBe(1);
    expect(storage.writeBatch).toHaveBeenCalledTimes(1);
    const written = storage.writeBatch.mock.calls[0]![2] as PreconDeckBatch[];
    expect(written.map((b) => b.code)).toEqual(["REAL"]);

    // Per-skip lines + a single grouped summary land in logs so a regression
    // (a real deck silently dropped) shows up by name on the next run.
    const logMessages = mockedLogInfo.mock.calls.map((c) => c[1]);
    expect(logMessages.filter((m) => m === "precon skipped").length).toBe(3);
    expect(logMessages.filter((m) => m === "precon skip summary").length).toBe(1);

    const summaryCall = mockedLogInfo.mock.calls.find(
      (c) => c[1] === "precon skip summary",
    );
    const summaryCtx = summaryCall?.[0] as unknown as {
      totalSkipped: number;
      grouped: Array<{ reason: string; type: string; count: number }>;
    };
    expect(summaryCtx.totalSkipped).toBe(3);
    const groupedKeys = summaryCtx.grouped.map((g) => `${g.reason}:${g.type}`);
    expect(groupedKeys).toEqual(
      expect.arrayContaining([
        "denied_type:From the Vault",
        "denied_type:Foil Set",
        "below_card_floor:Welcome Deck",
      ]),
    );
  });

  it("accepts decks with unknown product types and logs the unmapped types for review", async () => {
    const entries = [
      {
        code: "NEW",
        fileName: "New.json",
        name: "Mystery Booster Deck",
        releaseDate: "2026-04-01",
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            code: "NEW",
            name: "Mystery Booster Deck",
            type: "Mystery Booster Deck",
            releaseDate: "2026-04-01",
            commander: [],
            mainBoard: Array.from({ length: 60 }, (_, i) => ({
              name: `Card ${i}`,
              count: 1,
            })),
            sideBoard: [],
          },
        }),
        { status: 200 },
      ),
    );

    const out = await downloadAndStagePrecons(entries, "run-unknown");

    expect(out.skippedNonPlayable).toBe(0);
    expect(out.totalBatches).toBe(1);
    const written = storage.writeBatch.mock.calls[0]![2] as PreconDeckBatch[];
    expect(written.map((b) => b.code)).toEqual(["NEW"]);

    const unknownCall = mockedLogInfo.mock.calls.find(
      (c) => c[1] === "precon accepted with unmapped type (defaulted to CASUAL)",
    );
    expect(unknownCall).toBeDefined();
    const unknownCtx = unknownCall?.[0] as unknown as {
      unknownTypes: Array<{ type: string; sampleName: string; sampleCode: string }>;
    };
    expect(unknownCtx.unknownTypes).toEqual([
      {
        type: "Mystery Booster Deck",
        sampleName: "Mystery Booster Deck",
        sampleCode: "NEW",
      },
    ]);
  });
});

describe("cleanupPreconStaging", () => {
  it("delegates to the storage backend", async () => {
    await cleanupPreconStaging("run-c", 3);
    expect(storage.cleanup).toHaveBeenCalledWith("run-c", 3);
  });
});

describe("invalidateDeckDiscoveryCache", () => {
  it("revalidates the public-decks tag and the wotc user-decks tag", async () => {
    await invalidateDeckDiscoveryCache();
    const calls = mockedRevalidateTag.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls.every((c) => c[1] === "max")).toBe(true);
    const tags = calls.map((c) => c[0]);
    expect(tags.some((t) => typeof t === "string" && t.includes("wotc"))).toBe(
      true,
    );
  });
});
