import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { getBatchStorage } from "@/lib/staging";
import {
  acquireIngestLock,
  cleanupStaging,
  downloadAndStage,
  fetchBulkManifest,
  getLastCheckpoint,
  invalidateSearchCache,
  releaseIngestLock,
  SCRYFALL_SOURCE,
  upsertBatch,
  writeCheckpoint,
} from "../steps";

vi.mock("@/lib/db", () => {
  const prismaMock: Record<string, unknown> = {
    card: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    printing: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    cardToken: {
      upsert: vi.fn(),
    },
    ingestCheckpoint: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    ingestLock: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  // Accept both forms: $transaction([promise, ...]) and
  // $transaction((tx) => Promise.all([tx.x.update(...), ...])). The callback
  // form is passed the mock itself as `tx` so nested calls hit the same spies.
  prismaMock.$transaction = vi
    .fn()
    .mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => unknown)(prismaMock);
      }
      return Promise.all(arg as Iterable<unknown>);
    });
  return { prisma: prismaMock };
});

vi.mock("@/lib/staging", () => ({
  getBatchStorage: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

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

const mockedPrisma = vi.mocked(prisma, true);
const mockedGetStorage = vi.mocked(getBatchStorage);

let storage: FakeStorage;

beforeEach(() => {
  vi.clearAllMocks();
  // Default mocks: empty existing rows, no-op writes.
  mockedPrisma.card.findMany.mockResolvedValue([] as never);
  mockedPrisma.card.createMany.mockResolvedValue({ count: 0 } as never);
  mockedPrisma.card.update.mockResolvedValue({} as never);
  mockedPrisma.printing.findMany.mockResolvedValue([] as never);
  mockedPrisma.printing.createMany.mockResolvedValue({ count: 0 } as never);
  mockedPrisma.printing.update.mockResolvedValue({} as never);
  mockedPrisma.cardToken.upsert.mockResolvedValue({} as never);
  mockedPrisma.ingestCheckpoint.findUnique.mockResolvedValue(null as never);
  mockedPrisma.ingestCheckpoint.upsert.mockResolvedValue({} as never);
  mockedPrisma.ingestLock.create.mockResolvedValue({} as never);
  mockedPrisma.ingestLock.updateMany.mockResolvedValue({ count: 0 } as never);
  mockedPrisma.ingestLock.deleteMany.mockResolvedValue({ count: 0 } as never);
  storage = fakeStorage();
  mockedGetStorage.mockReturnValue(storage as never);
});

function makeCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: "scry-1",
    lang: "en",
    layout: "normal",
    games: ["paper"],
    name: "Test Card",
    type_line: "Creature — Wizard",
    oracle_text: "Do a thing.",
    mana_cost: "{1}{U}",
    cmc: 2,
    colors: ["U"],
    color_identity: ["U"],
    keywords: ["Flying"],
    power: "1",
    toughness: "2",
    legalities: { standard: "legal" },
    reserved: false,
    game_changer: false,
    set: "tst",
    set_name: "Test Set",
    collector_number: "1",
    finishes: ["nonfoil"],
    image_uris: { normal: "https://img/x.png" },
    prices: {},
    ...overrides,
  };
}

describe("fetchBulkManifest", () => {
  it("returns default_cards entry and sends expected headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              type: "default_cards",
              download_uri: "https://d.example/file.json",
              updated_at: "2026-01-01T00:00:00Z",
            },
            {
              type: "oracle_cards",
              download_uri: "https://d.example/oracle.json",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const out = await fetchBulkManifest();
    expect(out).toEqual({
      downloadUri: "https://d.example/file.json",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.scryfall.com/bulk-data",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "maindeck/0.1",
          Accept: "application/json",
        }),
      }),
    );

    fetchSpy.mockRestore();
  });

  it("retries then throws after exhausting attempts on persistent 500", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 500 }));
    await expect(fetchBulkManifest()).rejects.toThrow(/500/);
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    fetchSpy.mockRestore();
  });

  it("throws on 4xx without retrying", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchBulkManifest()).rejects.toThrow(/404/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("recovers when a 5xx is followed by a 200", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                type: "default_cards",
                download_uri: "https://d.example/file.json",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const out = await fetchBulkManifest();
    expect(out.downloadUri).toBe("https://d.example/file.json");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it("throws when default_cards entry is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              type: "oracle_cards",
              download_uri: "https://d.example/oracle.json",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(fetchBulkManifest()).rejects.toThrow(
      "default_cards entry missing",
    );
    fetchSpy.mockRestore();
  });
});

describe("downloadAndStage", () => {
  function streamCards(cards: ScryfallCard[]): Response {
    return new Response(JSON.stringify(cards), { status: 200 });
  }

  it("batches 501 paper cards into two writes (500 + 1) and counts skipped", async () => {
    const cards: ScryfallCard[] = [];
    for (let i = 0; i < 501; i++) {
      cards.push(makeCard({ id: `p-${i}`, name: `Paper ${i}` }));
    }
    for (let i = 0; i < 10; i++) {
      cards.push(
        makeCard({
          id: `np-${i}`,
          name: `NonPaper ${i}`,
          games: ["mtgo", "arena"],
        }),
      );
    }

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamCards(cards));

    const out = await downloadAndStage("https://d.example/file.json", "run-1");

    expect(out.totalBatches).toBe(2);
    expect(out.filterSkipped).toBe(10);
    expect(storage.writeBatch).toHaveBeenCalledTimes(2);

    const firstCall = storage.writeBatch.mock.calls[0]!;
    const secondCall = storage.writeBatch.mock.calls[1]!;
    expect(firstCall[0]).toBe("run-1");
    expect(firstCall[1]).toBe(0);
    expect(firstCall[2]).toHaveLength(500);
    expect(secondCall[1]).toBe(1);
    expect(secondCall[2]).toHaveLength(1);

    fetchSpy.mockRestore();
  });

  it("counts unparseable rows as filterSkipped", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([{ broken: true }]), { status: 200 }),
      );

    const out = await downloadAndStage("https://d.example/file.json", "run-x");
    expect(out.totalBatches).toBe(0);
    expect(out.filterSkipped).toBe(1);
    expect(storage.writeBatch).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("exactly BATCH (500) cards → one batch, no trailing partial write", async () => {
    const cards: ScryfallCard[] = [];
    for (let i = 0; i < 500; i++) {
      cards.push(makeCard({ id: `p-${i}`, name: `Paper ${i}` }));
    }
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamCards(cards));

    const out = await downloadAndStage("https://d.example/file.json", "run-2");

    expect(out.totalBatches).toBe(1);
    expect(out.filterSkipped).toBe(0);
    expect(storage.writeBatch).toHaveBeenCalledTimes(1);
    expect(storage.writeBatch.mock.calls[0]![2]).toHaveLength(500);

    fetchSpy.mockRestore();
  });

  it("zero cards pass filter → no writeBatch, totalBatches 0", async () => {
    const cards: ScryfallCard[] = [
      makeCard({ games: ["mtgo"] }),
      makeCard({ games: ["arena"] }),
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamCards(cards));

    const out = await downloadAndStage("https://d.example/file.json", "run-3");
    expect(out.totalBatches).toBe(0);
    expect(out.filterSkipped).toBe(2);
    expect(storage.writeBatch).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("throws on non-OK download response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 500 }));
    await expect(
      downloadAndStage("https://d.example/file.json", "run-4"),
    ).rejects.toThrow("bulk download: 500");
    fetchSpy.mockRestore();
  });

  it("throws when response has no body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    } as unknown as Response);
    await expect(
      downloadAndStage("https://d.example/file.json", "run-5"),
    ).rejects.toThrow("bulk download: 200");
    fetchSpy.mockRestore();
  });
});

describe("upsertBatch", () => {
  it("inserts new card and new printing", async () => {
    const card = makeCard({ id: "s-1", name: "A" });
    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 1, name: "A" }] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.cardsUpdated).toBe(0);
    expect(stats.cardsUnchanged).toBe(0);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.printingsUpdated).toBe(0);
    expect(stats.printingsUnchanged).toBe(0);
    expect(stats.printingsFailed).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(mockedPrisma.printing.createMany).toHaveBeenCalled();
  });

  it("counts only the printings actually inserted by createMany", async () => {
    const a = makeCard({ id: "s-1", name: "A" });
    const b = makeCard({ id: "s-2", name: "B" });
    storage.readBatch.mockResolvedValue([a, b]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 2 } as never);
    // skipDuplicates: only one of the two rows was actually inserted.
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    const stats = await upsertBatch("run", 0);
    expect(stats.printingsInserted).toBe(1);
  });

  it("updates card via $transaction when existing version differs", async () => {
    const card = makeCard({ id: "s-1", name: "A" });
    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany.mockResolvedValue([
      { id: 7, name: "A", version: "stale", nameSlug: "a" },
    ] as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsUpdated).toBe(1);
    expect(stats.cardsInserted).toBe(0);
    expect(mockedPrisma.card.update).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.card.createMany).not.toHaveBeenCalled();
  });

  it("leaves card unchanged when existing version matches", async () => {
    const card = makeCard({ id: "s-1", name: "A" });
    const { toCardCreate } = await import("@/lib/scryfall/map");
    const version = toCardCreate(card).version;

    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany.mockResolvedValue([
      { id: 7, name: "A", version, nameSlug: "a" },
    ] as never);
    mockedPrisma.printing.findMany.mockResolvedValue([
      {
        scryfallId: "s-1",
        version: (await import("@/lib/scryfall/map")).toPrintingCreate(7, card)
          .version,
      },
    ] as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsUnchanged).toBe(1);
    expect(stats.cardsUpdated).toBe(0);
    expect(stats.printingsUnchanged).toBe(1);
    expect(mockedPrisma.card.update).not.toHaveBeenCalled();
  });

  it("dedupes two Scryfall rows with the same name into 1 card / 2 printings", async () => {
    const a = makeCard({ id: "s-1", name: "Dup" });
    const b = makeCard({
      id: "s-2",
      name: "Dup",
      set: "other",
      collector_number: "2",
    });
    storage.readBatch.mockResolvedValue([a, b]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 1, name: "Dup" }] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 2 } as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsInserted).toBe(2);
  });

  it("skips a card whose nameSlug collides with another card already in the batch", async () => {
    const a = makeCard({ id: "s-a", name: "Gather the Townsfolk" });
    const b = makeCard({ id: "s-b", name: "Gather, the Townsfolk" });
    storage.readBatch.mockResolvedValue([a, b]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 1, name: "Gather the Townsfolk" },
      ] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsInserted).toBe(1);
    expect(mockedPrisma.card.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ name: "Gather the Townsfolk" }),
        ]),
      }),
    );
    const inserted = mockedPrisma.card.createMany.mock.calls[0]![0]!.data;
    expect(inserted).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it("skips a card whose nameSlug already exists in the DB on a different name", async () => {
    const incoming = makeCard({ id: "s-b", name: "Gather, the Townsfolk" });
    storage.readBatch.mockResolvedValue([incoming]);
    // DB already has a row with the same slug under a different name.
    mockedPrisma.card.findMany.mockResolvedValueOnce([
      {
        id: 99,
        name: "Gather the Townsfolk",
        version: "v",
        nameSlug: "gather-the-townsfolk",
      },
    ] as never);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(0);
    expect(mockedPrisma.card.createMany).not.toHaveBeenCalled();
    expect(stats.printingsInserted).toBe(0);
    warnSpy.mockRestore();
  });

  it("logs and counts unmappable printings via printingsFailed without failing the batch", async () => {
    const bad = makeCard({
      id: "s-bad",
      name: "Bad",
      image_uris: undefined,
      card_faces: undefined,
    });
    storage.readBatch.mockResolvedValue([bad]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 1, name: "Bad" }] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsFailed).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.printingsInserted).toBe(0);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('"scryfallId":"s-bad"'),
    );
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"could not map printing"'),
    );
    expect(mockedPrisma.printing.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.printing.createMany).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("skips printing when card hydration omits a row (no id assigned)", async () => {
    const a = makeCard({ id: "s-a", name: "A" });
    const b = makeCard({ id: "s-b", name: "B" });
    storage.readBatch.mockResolvedValue([a, b]);
    // Only "A" comes back in the post-insert hydration.
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 1, name: "A" }] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.printingsFailed).toBe(0);
  });

  it("skips printings that fail to map (no image)", async () => {
    const ok = makeCard({ id: "s-1", name: "A" });
    const bad = makeCard({
      id: "s-2",
      name: "B",
      image_uris: undefined,
      card_faces: undefined,
    });
    storage.readBatch.mockResolvedValue([ok, bad]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 2 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(2);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.printingsFailed).toBe(1);
    expect(stats.skipped).toBe(1);
    warnSpy.mockRestore();
  });

  it("empty batch returns zero stats and makes no Prisma calls", async () => {
    storage.readBatch.mockResolvedValue([]);

    const stats = await upsertBatch("run", 0);

    expect(stats).toEqual({
      cardsInserted: 0,
      cardsUpdated: 0,
      cardsUnchanged: 0,
      printingsInserted: 0,
      printingsUpdated: 0,
      printingsUnchanged: 0,
      printingsFailed: 0,
      skipped: 0,
    });
    expect(mockedPrisma.card.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.printing.findMany).not.toHaveBeenCalled();
  });

  it("mixed printings: inserted + updated + unchanged, with $transaction for updates", async () => {
    const { toPrintingCreate } = await import("@/lib/scryfall/map");

    const c1 = makeCard({ id: "s-new", name: "NewCard" });
    const c2 = makeCard({ id: "s-upd", name: "UpdCard" });
    const c3 = makeCard({ id: "s-same", name: "SameCard" });

    storage.readBatch.mockResolvedValue([c1, c2, c3]);

    const { toCardCreate } = await import("@/lib/scryfall/map");
    mockedPrisma.card.findMany.mockResolvedValue([
      {
        id: 1,
        name: "NewCard",
        version: toCardCreate(c1).version,
        nameSlug: "newcard",
      },
      {
        id: 2,
        name: "UpdCard",
        version: toCardCreate(c2).version,
        nameSlug: "updcard",
      },
      {
        id: 3,
        name: "SameCard",
        version: toCardCreate(c3).version,
        nameSlug: "samecard",
      },
    ] as never);

    mockedPrisma.printing.findMany.mockResolvedValue([
      { scryfallId: "s-upd", version: "stale" },
      {
        scryfallId: "s-same",
        version: toPrintingCreate(3, c3).version,
      },
    ] as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsUnchanged).toBe(3);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.printingsUpdated).toBe(1);
    expect(stats.printingsUnchanged).toBe(1);
    expect(mockedPrisma.printing.update).toHaveBeenCalledTimes(1);
    // exactly one $transaction call: printings update group (no card updates).
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("cleanupStaging", () => {
  it("calls storage.cleanup exactly once with the runId and totalBatches", async () => {
    await cleanupStaging("run-xyz", 5);
    expect(storage.cleanup).toHaveBeenCalledTimes(1);
    expect(storage.cleanup).toHaveBeenCalledWith("run-xyz", 5);
  });
});

describe("getLastCheckpoint", () => {
  it("returns the stored updatedAt when a row exists", async () => {
    mockedPrisma.ingestCheckpoint.findUnique.mockResolvedValue({
      updatedAt: "2026-01-01T00:00:00Z",
    } as never);

    const out = await getLastCheckpoint(SCRYFALL_SOURCE);

    expect(out).toBe("2026-01-01T00:00:00Z");
    expect(mockedPrisma.ingestCheckpoint.findUnique).toHaveBeenCalledWith({
      where: { source: SCRYFALL_SOURCE },
      select: { updatedAt: true },
    });
  });

  it("returns null when no row exists", async () => {
    mockedPrisma.ingestCheckpoint.findUnique.mockResolvedValue(null as never);
    const out = await getLastCheckpoint(SCRYFALL_SOURCE);
    expect(out).toBeNull();
  });
});

describe("writeCheckpoint", () => {
  it("upserts with matching create and update payloads", async () => {
    await writeCheckpoint(SCRYFALL_SOURCE, "2026-02-02T00:00:00Z");

    expect(mockedPrisma.ingestCheckpoint.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.ingestCheckpoint.upsert).toHaveBeenCalledWith({
      where: { source: SCRYFALL_SOURCE },
      create: {
        source: SCRYFALL_SOURCE,
        updatedAt: "2026-02-02T00:00:00Z",
      },
      update: { updatedAt: "2026-02-02T00:00:00Z" },
    });
  });
});

describe("acquireIngestLock", () => {
  it("returns true when no lock row exists", async () => {
    mockedPrisma.ingestLock.create.mockResolvedValueOnce({} as never);

    const acquired = await acquireIngestLock(SCRYFALL_SOURCE, "run-1");

    expect(acquired).toBe(true);
    expect(mockedPrisma.ingestLock.create).toHaveBeenCalledWith({
      data: { source: SCRYFALL_SOURCE, workflowId: "run-1" },
    });
    expect(mockedPrisma.ingestLock.updateMany).not.toHaveBeenCalled();
  });

  it("returns false when an active lock is held by another run", async () => {
    mockedPrisma.ingestLock.create.mockRejectedValueOnce(
      new Error("unique violation"),
    );
    mockedPrisma.ingestLock.updateMany.mockResolvedValueOnce({
      count: 0,
    } as never);

    const acquired = await acquireIngestLock(SCRYFALL_SOURCE, "run-2");

    expect(acquired).toBe(false);
  });

  it("steals a stale lock", async () => {
    mockedPrisma.ingestLock.create.mockRejectedValueOnce(
      new Error("unique violation"),
    );
    mockedPrisma.ingestLock.updateMany.mockResolvedValueOnce({
      count: 1,
    } as never);

    const acquired = await acquireIngestLock(SCRYFALL_SOURCE, "run-3");

    expect(acquired).toBe(true);
    const args = mockedPrisma.ingestLock.updateMany.mock.calls[0]![0] as {
      where: { source: string; acquiredAt: { lt: Date } };
      data: { workflowId: string };
    };
    expect(args.where.source).toBe(SCRYFALL_SOURCE);
    expect(args.where.acquiredAt.lt).toBeInstanceOf(Date);
    expect(args.data.workflowId).toBe("run-3");
  });
});

describe("releaseIngestLock", () => {
  it("deletes only the lock row owned by the caller", async () => {
    await releaseIngestLock(SCRYFALL_SOURCE, "run-1");

    expect(mockedPrisma.ingestLock.deleteMany).toHaveBeenCalledWith({
      where: { source: SCRYFALL_SOURCE, workflowId: "run-1" },
    });
  });
});

describe("upsertBatch — token enrichment", () => {
  it("creates CardToken rows for all_parts entries with component=token", async () => {
    const card = makeCard({
      id: "s-1",
      name: "Goblin Rabblemaster",
      all_parts: [
        {
          id: "token-goblin",
          component: "token",
          name: "Goblin Token",
          type_line: "Token Creature — Goblin",
          uri: "https://api.scryfall.com/cards/token-goblin",
        },
      ],
    });
    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 1, name: "Goblin Rabblemaster" },
      ] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    await upsertBatch("run", 0);

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
    const txCalls = mockedPrisma.$transaction.mock.calls;
    // Last $transaction call should include the token upsert
    const lastTxCall = txCalls[txCalls.length - 1]![0];
    expect(lastTxCall).toHaveLength(1);
    expect(mockedPrisma.cardToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardId_tokenScryfallId: {
            cardId: 1,
            tokenScryfallId: "token-goblin",
          },
        },
        create: expect.objectContaining({
          cardId: 1,
          tokenName: "Goblin Token",
          tokenScryfallId: "token-goblin",
        }),
      }),
    );
  });

  it("does not create CardToken rows for meld_part, meld_result, or combo_piece parts", async () => {
    const card = makeCard({
      id: "s-1",
      name: "Urza, Lord High Artificer",
      all_parts: [
        {
          id: "meld-part",
          component: "meld_part",
          name: "Meld Part",
          type_line: "Creature",
          uri: "https://api.scryfall.com/cards/meld-part",
        },
        {
          id: "meld-result",
          component: "meld_result",
          name: "Meld Result",
          type_line: "Creature",
          uri: "https://api.scryfall.com/cards/meld-result",
        },
        {
          id: "combo",
          component: "combo_piece",
          name: "Combo Piece",
          type_line: "Artifact",
          uri: "https://api.scryfall.com/cards/combo",
        },
      ],
    });
    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 1, name: "Urza, Lord High Artificer" },
      ] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    await upsertBatch("run", 0);

    expect(mockedPrisma.cardToken.upsert).not.toHaveBeenCalled();
  });

  it("does not create CardToken rows for a card with no all_parts", async () => {
    const card = makeCard({ id: "s-1", name: "Island" });
    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 1, name: "Island" }] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    await upsertBatch("run", 0);

    expect(mockedPrisma.cardToken.upsert).not.toHaveBeenCalled();
  });

  it("silently skips token upsert for a card that was not hydrated after createMany", async () => {
    const mapped = makeCard({
      id: "s-mapped",
      name: "Mapped",
      all_parts: [
        {
          id: "token-mapped",
          component: "token",
          name: "Mapped Token",
          type_line: "Token Creature",
          uri: "https://api.scryfall.com/cards/token-mapped",
        },
      ],
    });
    const unmapped = makeCard({
      id: "s-unmapped",
      name: "Unmapped",
      all_parts: [
        {
          id: "token-unmapped",
          component: "token",
          name: "Unmapped Token",
          type_line: "Token Creature",
          uri: "https://api.scryfall.com/cards/token-unmapped",
        },
      ],
    });
    storage.readBatch.mockResolvedValue([mapped, unmapped]);
    // Only "Mapped" is returned with an id — the second card is missing from
    // idByName, so upsertTokens must take the continue branch for "Unmapped".
    mockedPrisma.card.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 1, name: "Mapped" }] as never);
    mockedPrisma.card.createMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.printing.createMany.mockResolvedValue({ count: 1 } as never);

    await upsertBatch("run", 0);

    expect(mockedPrisma.cardToken.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.cardToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardId_tokenScryfallId: {
            cardId: 1,
            tokenScryfallId: "token-mapped",
          },
        },
      }),
    );
  });
});

describe("invalidateSearchCache", () => {
  it("revalidates the card-search tag exactly once", async () => {
    await invalidateSearchCache();
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith("card-search", "max");
  });
});
