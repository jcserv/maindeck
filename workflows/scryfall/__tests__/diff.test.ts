import { describe, expect, it, vi } from "vitest";
import {
  dedupeCards,
  diffCards,
  diffPrintings,
  type ExistingCardRow,
  type ExistingPrintingRow,
} from "@/lib/scryfall/diff";
import { toCardCreate, type PrintingCreateData } from "@/lib/scryfall/map";
import type { ScryfallCard } from "@/lib/scryfall/types";

vi.mock("@/lib/telemetry", () => ({
  logWarn: vi.fn(),
}));

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

function makePrinting(
  overrides: Partial<PrintingCreateData> = {},
): PrintingCreateData {
  return {
    scryfallId: "scry-1",
    cardId: 1,
    setCode: "tst",
    setName: "Test Set",
    collectorNumber: "1",
    finishes: ["nonfoil"],
    imageUri: "https://img/x.png",
    backImageUri: null,
    artist: null,
    flavorText: null,
    releasedAt: null,
    priceUsd: null,
    priceUsdFoil: null,
    priceUsdEtched: null,
    rarity: null,
    version: "v1",
    ...overrides,
  } as PrintingCreateData;
}

describe("dedupeCards", () => {
  it("collapses duplicate names, keeping the first occurrence", () => {
    const a = makeCard({ id: "a", name: "Lightning Bolt" });
    const b = makeCard({ id: "b", name: "Lightning Bolt" });
    const map = dedupeCards([a, b]);
    expect(map.size).toBe(1);
    expect(map.has("Lightning Bolt")).toBe(true);
  });

  it("keeps unrelated cards", () => {
    const a = makeCard({ id: "a", name: "Lightning Bolt" });
    const b = makeCard({ id: "b", name: "Counterspell" });
    const map = dedupeCards([a, b]);
    expect(map.size).toBe(2);
  });
});

describe("diffCards", () => {
  it("inserts cards that don't match an existing row", () => {
    const incoming = dedupeCards([makeCard({ name: "Lightning Bolt" })]);
    const diff = diffCards(incoming, []);
    expect(diff.toInsert).toHaveLength(1);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.unchangedIds.size).toBe(0);
  });

  it("flags rows whose version differs as updates", () => {
    const create = toCardCreate(makeCard({ name: "Lightning Bolt" }));
    const incoming = new Map([[create.name, create]]);
    const existing: ExistingCardRow[] = [
      {
        id: 7,
        name: "Lightning Bolt",
        version: "old-version",
        nameSlug: create.nameSlug ?? null,
      },
    ];
    const diff = diffCards(incoming, existing);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.updateIds.get("Lightning Bolt")).toBe(7);
  });

  it("treats matching version + non-null slug as unchanged", () => {
    const create = toCardCreate(makeCard({ name: "Lightning Bolt" }));
    const incoming = new Map([[create.name, create]]);
    const existing: ExistingCardRow[] = [
      {
        id: 7,
        name: "Lightning Bolt",
        version: create.version,
        nameSlug: create.nameSlug ?? "lightning-bolt",
      },
    ];
    const diff = diffCards(incoming, existing);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toInsert).toHaveLength(0);
    expect(diff.unchangedIds.get("Lightning Bolt")).toBe(7);
  });

  it("forces an update when stored slug is null (backfill)", () => {
    const create = toCardCreate(makeCard({ name: "Lightning Bolt" }));
    const incoming = new Map([[create.name, create]]);
    const existing: ExistingCardRow[] = [
      {
        id: 7,
        name: "Lightning Bolt",
        version: create.version,
        nameSlug: null,
      },
    ];
    const diff = diffCards(incoming, existing);
    expect(diff.toUpdate).toHaveLength(1);
  });

  it("skips inserts when slug is owned by a different existing card", () => {
    const create = toCardCreate(makeCard({ name: "Æther Vial" }));
    const incoming = new Map([[create.name, create]]);
    const existing: ExistingCardRow[] = [
      {
        id: 9,
        name: "Aether Vial",
        version: "v9",
        nameSlug: create.nameSlug ?? "aether-vial",
      },
    ];
    const diff = diffCards(incoming, existing);
    expect(diff.toInsert).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
  });

  it("skips updates when the new slug is owned by a different existing card", () => {
    const create = toCardCreate(makeCard({ name: "Æther Vial" }));
    const incoming = new Map([[create.name, create]]);
    const existing: ExistingCardRow[] = [
      {
        id: 9,
        name: "Aether Vial",
        version: "v9",
        nameSlug: create.nameSlug ?? "aether-vial",
      },
      {
        id: 10,
        name: "Æther Vial",
        version: "old-version",
        nameSlug: null,
      },
    ];
    const diff = diffCards(incoming, existing);
    expect(diff.toInsert).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.unchangedIds.size).toBe(0);
  });
});

describe("diffPrintings", () => {
  it("inserts printings whose scryfallId is new", () => {
    const diff = diffPrintings([makePrinting()], []);
    expect(diff.toInsert).toHaveLength(1);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.unchanged).toBe(0);
  });

  it("updates printings whose version changed", () => {
    const printing = makePrinting({ version: "v2" });
    const existing: ExistingPrintingRow[] = [
      { scryfallId: printing.scryfallId, version: "v1" },
    ];
    const diff = diffPrintings([printing], existing);
    expect(diff.toUpdate).toHaveLength(1);
  });

  it("skips printings whose version matches", () => {
    const printing = makePrinting({ version: "v1" });
    const existing: ExistingPrintingRow[] = [
      { scryfallId: printing.scryfallId, version: "v1" },
    ];
    const diff = diffPrintings([printing], existing);
    expect(diff.unchanged).toBe(1);
    expect(diff.toInsert).toHaveLength(0);
  });
});
