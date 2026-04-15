import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { getBatchStorage } from "@/lib/staging";
import {
  cleanupStaging,
  downloadAndStage,
  fetchBulkManifest,
  upsertBatch,
} from "../steps";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
      createManyAndReturn: vi.fn(),
      update: vi.fn(),
    },
    printing: {
      findMany: vi.fn(),
      createManyAndReturn: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (calls) => {
      // Mirror Prisma's behavior: resolve every queued promise. Tests pass
      // arrays of `prisma.X.update(...)` calls which are themselves promises
      // here because the mocked `update` returns whatever vi.fn returns.
      return Promise.all(calls);
    }),
  },
}));

vi.mock("@/lib/staging", () => ({
  getBatchStorage: vi.fn(),
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
  mockedPrisma.card.createManyAndReturn.mockResolvedValue([] as never);
  mockedPrisma.card.update.mockResolvedValue({} as never);
  mockedPrisma.printing.findMany.mockResolvedValue([] as never);
  mockedPrisma.printing.createManyAndReturn.mockResolvedValue([] as never);
  mockedPrisma.printing.update.mockResolvedValue({} as never);
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

    const firstCall = storage.writeBatch.mock.calls[0];
    const secondCall = storage.writeBatch.mock.calls[1];
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
    expect(storage.writeBatch.mock.calls[0][2]).toHaveLength(500);

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
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "A" },
    ] as never);
    mockedPrisma.printing.createManyAndReturn.mockResolvedValue([
      { scryfallId: "s-1" },
    ] as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.cardsUpdated).toBe(0);
    expect(stats.cardsUnchanged).toBe(0);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.printingsUpdated).toBe(0);
    expect(stats.printingsUnchanged).toBe(0);
    expect(stats.printingsFailed).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(mockedPrisma.printing.createManyAndReturn).toHaveBeenCalled();
  });

  it("counts only the printings actually returned by createManyAndReturn", async () => {
    const a = makeCard({ id: "s-1", name: "A" });
    const b = makeCard({ id: "s-2", name: "B" });
    storage.readBatch.mockResolvedValue([a, b]);
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ] as never);
    // DB only returns one row even though two were requested.
    mockedPrisma.printing.createManyAndReturn.mockResolvedValue([
      { scryfallId: "s-1" },
    ] as never);

    const stats = await upsertBatch("run", 0);
    expect(stats.printingsInserted).toBe(1);
  });

  it("updates card via $transaction when existing version differs", async () => {
    const card = makeCard({ id: "s-1", name: "A" });
    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany.mockResolvedValue([
      { id: 7, name: "A", version: "stale" },
    ] as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsUpdated).toBe(1);
    expect(stats.cardsInserted).toBe(0);
    expect(mockedPrisma.card.update).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.card.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("leaves card unchanged when existing version matches", async () => {
    const card = makeCard({ id: "s-1", name: "A" });
    const { toCardCreate } = await import("@/lib/scryfall/map");
    const version = toCardCreate(card).version;

    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany.mockResolvedValue([
      { id: 7, name: "A", version },
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
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "Dup" },
    ] as never);
    mockedPrisma.printing.createManyAndReturn.mockResolvedValue([
      { scryfallId: "s-1" },
      { scryfallId: "s-2" },
    ] as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsInserted).toBe(2);
  });

  it("logs and counts unmappable printings via printingsFailed without failing the batch", async () => {
    const bad = makeCard({
      id: "s-bad",
      name: "Bad",
      image_uris: undefined,
      card_faces: undefined,
    });
    storage.readBatch.mockResolvedValue([bad]);
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "Bad" },
    ] as never);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsFailed).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.printingsInserted).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not map printing s-bad"),
    );
    expect(mockedPrisma.printing.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.printing.createManyAndReturn).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("skips printing when createManyAndReturn omits a card (no id assigned)", async () => {
    const a = makeCard({ id: "s-a", name: "A" });
    const b = makeCard({ id: "s-b", name: "B" });
    storage.readBatch.mockResolvedValue([a, b]);
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "A" },
    ] as never);
    mockedPrisma.printing.createManyAndReturn.mockResolvedValue([
      { scryfallId: "s-a" },
    ] as never);

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
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ] as never);
    mockedPrisma.printing.createManyAndReturn.mockResolvedValue([
      { scryfallId: "s-1" },
    ] as never);

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
      { id: 1, name: "NewCard", version: toCardCreate(c1).version },
      { id: 2, name: "UpdCard", version: toCardCreate(c2).version },
      { id: 3, name: "SameCard", version: toCardCreate(c3).version },
    ] as never);

    mockedPrisma.printing.findMany.mockResolvedValue([
      { scryfallId: "s-upd", version: "stale" },
      {
        scryfallId: "s-same",
        version: toPrintingCreate(3, c3).version,
      },
    ] as never);
    mockedPrisma.printing.createManyAndReturn.mockResolvedValue([
      { scryfallId: "s-new" },
    ] as never);

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
  it("calls storage.cleanup exactly once with the runId", async () => {
    await cleanupStaging("run-xyz");
    expect(storage.cleanup).toHaveBeenCalledTimes(1);
    expect(storage.cleanup).toHaveBeenCalledWith("run-xyz");
  });
});
