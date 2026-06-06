import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/deck-access", () => ({
  requireDeckViewable: vi.fn(),
}));
vi.mock("@/lib/deck/queries", () => ({
  getDeckById: vi.fn(),
}));
vi.mock("@/lib/deck/io/adapters", () => ({
  serializers: [
    {
      id: "text",
      serialize: vi.fn((deck: { cards: { zone: string; card: { name: string }; quantity: number }[] }) =>
        deck.cards.map((c) => `${c.quantity} ${c.card.name}`).join("\n"),
      ),
    },
    {
      id: "arena",
      serialize: vi.fn((deck: { cards: { zone: string; card: { name: string }; quantity: number }[] }) =>
        deck.cards.map((c) => `${c.quantity} ${c.card.name}`).join("\n"),
      ),
    },
  ],
}));
vi.mock("@/lib/deck/io/serialize", () => ({
  toMaindeckJson: vi.fn(() => "{}"),
}));

import { requireDeckViewable } from "@/lib/auth/deck-access";
import { getDeckById } from "@/lib/deck/queries";
import { getDeckExports } from "../deck/export";

const mockRequireViewable = vi.mocked(requireDeckViewable);
const mockGetDeckById = vi.mocked(getDeckById);

const DECK_ID = "deck-1";

function makeCard(
  name: string,
  zone: "MAINBOARD" | "SIDEBOARD" | "COMMANDER" | "CONSIDERING",
  category: string | null = null,
) {
  return {
    id: name,
    deckId: DECK_ID,
    cardId: name,
    quantity: 1,
    zone,
    category,
    printingId: null,
    isFoil: false,
    card: { name },
    printing: null,
  };
}

const MOCK_DECK = {
  id: DECK_ID,
  name: "Test Deck",
  format: "COMMANDER",
  visibility: "PUBLIC",
  description: null,
  cards: [
    makeCard("Sol Ring", "COMMANDER"),
    makeCard("Lightning Bolt", "MAINBOARD", "Removal"),
    makeCard("Cultivate", "MAINBOARD", "Ramp"),
    makeCard("Forest", "MAINBOARD"),
    makeCard("Snapcaster Mage", "SIDEBOARD"),
    makeCard("Ponder", "CONSIDERING"),
  ],
  categories: [
    { id: "1", deckId: DECK_ID, name: "Removal", sortOrder: 0, createdAt: new Date() },
    { id: "2", deckId: DECK_ID, name: "Ramp", sortOrder: 1, createdAt: new Date() },
  ],
  userId: "user-1",
  updatedAt: new Date(),
  manualBracket: null,
  externalSource: null,
  likeCount: 0,
  user: { id: "user-1", username: "tester", image: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireViewable.mockResolvedValue(undefined as never);
  mockGetDeckById.mockResolvedValue(MOCK_DECK as never);
});

describe("getDeckExports", () => {
  it("returns availableZones from all cards", async () => {
    const result = await getDeckExports(DECK_ID);
    expect(result.availableZones).toEqual(
      expect.arrayContaining(["COMMANDER", "MAINBOARD", "SIDEBOARD", "CONSIDERING"]),
    );
  });

  it("returns availableCategories from deck.categories", async () => {
    const result = await getDeckExports(DECK_ID);
    expect(result.availableCategories).toEqual(["Removal", "Ramp"]);
  });

  it("no filter → all cards included", async () => {
    const { serializers } = await import("@/lib/deck/io/adapters");
    await getDeckExports(DECK_ID);
    const textAdapter = serializers.find((a) => a.id === "text")!;
    const calledDeck = vi.mocked(textAdapter.serialize).mock.calls[0]?.[0];
    expect(calledDeck?.cards).toHaveLength(6);
  });

  it("zone filter: MAINBOARD only → excludes sideboard/considering/commander", async () => {
    const { serializers } = await import("@/lib/deck/io/adapters");
    await getDeckExports(DECK_ID, { zones: ["MAINBOARD"] });
    const textAdapter = serializers.find((a) => a.id === "text")!;
    const calledDeck = vi.mocked(textAdapter.serialize).mock.calls[0]?.[0];
    expect(calledDeck?.cards.every((c: { zone: string }) => c.zone === "MAINBOARD")).toBe(true);
    expect(calledDeck?.cards).toHaveLength(3);
  });

  it("zone filter: COMMANDER + MAINBOARD → excludes sideboard and considering", async () => {
    const { serializers } = await import("@/lib/deck/io/adapters");
    await getDeckExports(DECK_ID, { zones: ["COMMANDER", "MAINBOARD"] });
    const textAdapter = serializers.find((a) => a.id === "text")!;
    const calledDeck = vi.mocked(textAdapter.serialize).mock.calls[0]?.[0];
    const zones = new Set(calledDeck?.cards.map((c: { zone: string }) => c.zone));
    expect(zones.has("SIDEBOARD")).toBe(false);
    expect(zones.has("CONSIDERING")).toBe(false);
  });

  it("category filter: Ramp only → only Ramp mainboard cards (uncategorized + others excluded)", async () => {
    const { serializers } = await import("@/lib/deck/io/adapters");
    await getDeckExports(DECK_ID, {
      zones: ["MAINBOARD"],
      categories: ["Ramp"],
    });
    const textAdapter = serializers.find((a) => a.id === "text")!;
    const calledDeck = vi.mocked(textAdapter.serialize).mock.calls[0]?.[0];
    // Cultivate (Ramp) + Forest (null category, passes through) remain
    expect(calledDeck?.cards.find((c: { card: { name: string } }) => c.card.name === "Lightning Bolt")).toBeUndefined();
    expect(calledDeck?.cards.find((c: { card: { name: string } }) => c.card.name === "Cultivate")).toBeDefined();
  });

  it("category filter passes uncategorized cards", async () => {
    const { serializers } = await import("@/lib/deck/io/adapters");
    await getDeckExports(DECK_ID, {
      zones: ["MAINBOARD"],
      categories: ["Ramp"],
    });
    const textAdapter = serializers.find((a) => a.id === "text")!;
    const calledDeck = vi.mocked(textAdapter.serialize).mock.calls[0]?.[0];
    expect(calledDeck?.cards.find((c: { card: { name: string } }) => c.card.name === "Forest")).toBeDefined();
  });

  it("category filter strips matching categories from deck.categories", async () => {
    const { serializers } = await import("@/lib/deck/io/adapters");
    await getDeckExports(DECK_ID, {
      zones: ["MAINBOARD"],
      categories: ["Ramp"],
    });
    const textAdapter = serializers.find((a) => a.id === "text")!;
    const calledDeck = vi.mocked(textAdapter.serialize).mock.calls[0]?.[0];
    expect(calledDeck?.categories).toHaveLength(1);
    expect(calledDeck?.categories?.[0]?.name).toBe("Ramp");
  });

  it("returns empty on missing deck", async () => {
    mockGetDeckById.mockResolvedValue(null as never);
    const result = await getDeckExports(DECK_ID);
    expect(result).toEqual({
      text: "",
      arena: "",
      json: "",
      availableZones: [],
      availableCategories: [],
    });
  });
});
