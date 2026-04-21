import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Zone } from "@/lib/generated/prisma/client";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deckCard: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { getTokensForDeck } from "../token-queries";

const mockFindMany = vi.mocked(prisma.deckCard.findMany);

function makeDeckCard(
  cardId: number,
  cardName: string,
  zone: Zone,
  tokens: { tokenName: string; tokenScryfallId: string }[] = [],
) {
  return {
    id: `dc-${cardId}`,
    deckId: "deck-1",
    cardId,
    quantity: 1,
    zone,
    category: null,
    printingId: null,
    isFoil: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    card: {
      id: cardId,
      name: cardName,
      tokens: tokens.map((t, i) => ({
        id: i + 1,
        cardId,
        tokenName: t.tokenName,
        tokenScryfallId: t.tokenScryfallId,
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTokensForDeck", () => {
  it("returns deduplicated tokens for a deck", async () => {
    mockFindMany.mockResolvedValue([
      makeDeckCard(1, "Goblin Rabblemaster", "MAINBOARD", [
        { tokenName: "Goblin Token", tokenScryfallId: "token-goblin-1" },
      ]),
    ] as never);

    const result = await getTokensForDeck("deck-1");

    expect(result).toHaveLength(1);
    expect(result[0]!.tokenName).toBe("Goblin Token");
    expect(result[0]!.tokenScryfallId).toBe("token-goblin-1");
    expect(result[0]!.producedBy).toEqual(["Goblin Rabblemaster"]);
  });

  it("lists all producers when multiple cards produce the same token", async () => {
    mockFindMany.mockResolvedValue([
      makeDeckCard(1, "Card A", "MAINBOARD", [
        { tokenName: "Soldier Token", tokenScryfallId: "token-soldier" },
      ]),
      makeDeckCard(2, "Card B", "MAINBOARD", [
        { tokenName: "Soldier Token", tokenScryfallId: "token-soldier" },
      ]),
    ] as never);

    const result = await getTokensForDeck("deck-1");

    expect(result).toHaveLength(1);
    expect(result[0]!.tokenName).toBe("Soldier Token");
    expect(result[0]!.producedBy).toEqual(["Card A", "Card B"]);
  });

  it("deduplicates tokens when one card produces multiple different tokens", async () => {
    mockFindMany.mockResolvedValue([
      makeDeckCard(1, "Avenger of Zendikar", "MAINBOARD", [
        { tokenName: "Plant Token", tokenScryfallId: "token-plant" },
        { tokenName: "Elemental Token", tokenScryfallId: "token-elemental" },
      ]),
    ] as never);

    const result = await getTokensForDeck("deck-1");

    expect(result).toHaveLength(2);
    const names = result.map((t) => t.tokenName).sort();
    expect(names).toEqual(["Elemental Token", "Plant Token"]);
  });

  it("deduplicates producers across multiple DeckCard rows for the same card", async () => {
    const goblinToken = {
      tokenName: "Goblin Token",
      tokenScryfallId: "token-goblin-1",
    };
    // Same card name appearing as two DeckCard rows (e.g. different printings
    // pinned, or MAINBOARD + COMMANDER zones). Producers should list the card
    // name exactly once.
    mockFindMany.mockResolvedValue([
      makeDeckCard(1, "Krenko, Mob Boss", "MAINBOARD", [goblinToken]),
      makeDeckCard(1, "Krenko, Mob Boss", "COMMANDER", [goblinToken]),
    ] as never);

    const result = await getTokensForDeck("deck-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.producedBy).toEqual(["Krenko, Mob Boss"]);
  });

  it("collapses duplicate token printings (same name, different scryfall ids)", async () => {
    // Scryfall's all_parts lists every printing of a token as a separate
    // related-part; Marionette Master points at 3 Servo printings. We should
    // render one row per token name, not one per printing.
    mockFindMany.mockResolvedValue([
      makeDeckCard(1, "Marionette Master", "MAINBOARD", [
        { tokenName: "Servo", tokenScryfallId: "servo-kld" },
        { tokenName: "Servo", tokenScryfallId: "servo-aer" },
        { tokenName: "Servo", tokenScryfallId: "servo-ncc" },
      ]),
    ] as never);

    const result = await getTokensForDeck("deck-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.tokenName).toBe("Servo");
    expect(result[0]!.producedBy).toEqual(["Marionette Master"]);
  });

  it("query excludes SIDEBOARD and CONSIDERING zones (Commander included)", async () => {
    mockFindMany.mockResolvedValue([] as never);

    await getTokensForDeck("deck-1");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deckId: "deck-1",
          zone: { notIn: ["SIDEBOARD", "CONSIDERING"] },
        },
      }),
    );
  });

  it("includes tokens from COMMANDER zone", async () => {
    mockFindMany.mockResolvedValue([
      makeDeckCard(1, "Krenko, Mob Boss", "COMMANDER", [
        { tokenName: "Goblin Token", tokenScryfallId: "token-goblin" },
      ]),
    ] as never);

    const result = await getTokensForDeck("deck-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.producedBy).toEqual(["Krenko, Mob Boss"]);
  });

  it("returns empty array for a deck with no cards", async () => {
    mockFindMany.mockResolvedValue([] as never);

    const result = await getTokensForDeck("deck-1");
    expect(result).toEqual([]);
  });

  it("returns empty array when no cards produce tokens", async () => {
    mockFindMany.mockResolvedValue([
      makeDeckCard(1, "Island", "MAINBOARD", []),
      makeDeckCard(2, "Forest", "MAINBOARD", []),
    ] as never);

    const result = await getTokensForDeck("deck-1");
    expect(result).toEqual([]);
  });
});
