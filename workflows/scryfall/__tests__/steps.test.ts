import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { getBatchStorage } from "@/lib/staging";
import { prisma } from "@/lib/db";
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
      createMany: vi.fn(),
      update: vi.fn(),
    },
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

  it("throws on non-OK response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 500 }));
    await expect(fetchBulkManifest()).rejects.toThrow(
      "bulk-data manifest: 500",
    );
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
    mockedPrisma.card.findMany.mockResolvedValue([] as never);
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "A" },
    ] as never);
    mockedPrisma.printing.findMany.mockResolvedValue([] as never);
    mockedPrisma.printing.createMany.mockResolvedValue({} as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.cardsUpdated).toBe(0);
    expect(stats.cardsUnchanged).toBe(0);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.printingsUpdated).toBe(0);
    expect(stats.printingsUnchanged).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(mockedPrisma.printing.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it("updates card when existing version differs", async () => {
    const card = makeCard({ id: "s-1", name: "A" });
    storage.readBatch.mockResolvedValue([card]);
    mockedPrisma.card.findMany.mockResolvedValue([
      { id: 7, name: "A", version: "stale" },
    ] as never);
    mockedPrisma.printing.findMany.mockResolvedValue([] as never);
    mockedPrisma.printing.createMany.mockResolvedValue({} as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsUpdated).toBe(1);
    expect(stats.cardsInserted).toBe(0);
    expect(mockedPrisma.card.update).toHaveBeenCalledTimes(1);
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
    mockedPrisma.card.findMany.mockResolvedValue([] as never);
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "Dup" },
    ] as never);
    mockedPrisma.printing.findMany.mockResolvedValue([] as never);
    mockedPrisma.printing.createMany.mockResolvedValue({} as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsInserted).toBe(2);
  });

  it("returns early when every printing fails to map", async () => {
    const bad = makeCard({
      id: "s-bad",
      name: "Bad",
      image_uris: undefined,
      card_faces: undefined,
    });
    storage.readBatch.mockResolvedValue([bad]);
    mockedPrisma.card.findMany.mockResolvedValue([] as never);
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "Bad" },
    ] as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.printingsInserted).toBe(0);
    expect(mockedPrisma.printing.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.printing.createMany).not.toHaveBeenCalled();
  });

  it("skips printing when createManyAndReturn omits a card (no id assigned)", async () => {
    const a = makeCard({ id: "s-a", name: "A" });
    const b = makeCard({ id: "s-b", name: "B" });
    storage.readBatch.mockResolvedValue([a, b]);
    mockedPrisma.card.findMany.mockResolvedValue([] as never);
    // createManyAndReturn pretends only A came back — B has no id.
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "A" },
    ] as never);
    mockedPrisma.printing.findMany.mockResolvedValue([] as never);
    mockedPrisma.printing.createMany.mockResolvedValue({} as never);

    const stats = await upsertBatch("run", 0);

    // Both were queued for insert but only one came back; the orphan gets
    // skipped at the idByName lookup before toPrintingCreate is called.
    expect(stats.cardsInserted).toBe(1);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.skipped).toBe(0);
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
    mockedPrisma.card.findMany.mockResolvedValue([] as never);
    mockedPrisma.card.createManyAndReturn.mockResolvedValue([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ] as never);
    mockedPrisma.printing.findMany.mockResolvedValue([] as never);
    mockedPrisma.printing.createMany.mockResolvedValue({} as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsInserted).toBe(2);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.skipped).toBe(1);
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
      skipped: 0,
    });
    expect(mockedPrisma.card.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.printing.findMany).not.toHaveBeenCalled();
  });

  it("mixed printings: inserted + updated + unchanged", async () => {
    const { toPrintingCreate } = await import("@/lib/scryfall/map");

    const c1 = makeCard({ id: "s-new", name: "NewCard" });
    const c2 = makeCard({ id: "s-upd", name: "UpdCard" });
    const c3 = makeCard({ id: "s-same", name: "SameCard" });

    storage.readBatch.mockResolvedValue([c1, c2, c3]);

    // Pretend all three cards already exist with matching versions so we
    // isolate the printings branch logic.
    const { toCardCreate } = await import("@/lib/scryfall/map");
    mockedPrisma.card.findMany.mockResolvedValue([
      { id: 1, name: "NewCard", version: toCardCreate(c1).version },
      { id: 2, name: "UpdCard", version: toCardCreate(c2).version },
      { id: 3, name: "SameCard", version: toCardCreate(c3).version },
    ] as never);

    // Printing c1 is new (no existing row), c2 has stale version, c3 matches.
    mockedPrisma.printing.findMany.mockResolvedValue([
      { scryfallId: "s-upd", version: "stale" },
      {
        scryfallId: "s-same",
        version: toPrintingCreate(3, c3).version,
      },
    ] as never);
    mockedPrisma.printing.createMany.mockResolvedValue({} as never);

    const stats = await upsertBatch("run", 0);

    expect(stats.cardsUnchanged).toBe(3);
    expect(stats.printingsInserted).toBe(1);
    expect(stats.printingsUpdated).toBe(1);
    expect(stats.printingsUnchanged).toBe(1);
    expect(mockedPrisma.printing.update).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.printing.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
});

describe("cleanupStaging", () => {
  it("calls storage.cleanup exactly once with the runId", async () => {
    await cleanupStaging("run-xyz");
    expect(storage.cleanup).toHaveBeenCalledTimes(1);
    expect(storage.cleanup).toHaveBeenCalledWith("run-xyz");
  });
});
