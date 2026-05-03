import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    deckCard: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  getCardBySlug,
  getCardImagesByNames,
  getDecksContainingCard,
} from "../queries";

const mockCardFindUnique = vi.mocked(prisma.card.findUnique);
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCardBySlug", () => {
  it("returns null when no card matches", async () => {
    mockCardFindUnique.mockResolvedValue(null);
    expect(await getCardBySlug("missing")).toBeNull();
  });

  it("maps card + first printing into the CardDetail shape", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: 1,
      name: "Sol Ring",
      manaCost: "{1}",
      typeLine: "Artifact",
      oracleText: "Add {C}{C}.",
      mainType: "ARTIFACT",
      colors: [],
      cmc: 1,
      gameChanger: false,
      printings: [
        {
          imageUri: "/img.webp",
          collectorNumber: "001",
          setCode: "C21",
          setName: "Commander 2021",
        },
      ],
    } as never);
    const out = await getCardBySlug("sol-ring");
    expect(out).toEqual({
      id: 1,
      name: "Sol Ring",
      manaCost: "{1}",
      typeLine: "Artifact",
      oracleText: "Add {C}{C}.",
      mainType: "ARTIFACT",
      colors: [],
      cmc: 1,
      collectorNumber: "001",
      setCode: "C21",
      setName: "Commander 2021",
      imageUri: "/img.webp",
      gameChanger: false,
      edhrecRank: null,
    });
  });

  it("falls back to nulls when the card has no printings", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: 2,
      name: "Mystery",
      manaCost: null,
      typeLine: null,
      oracleText: null,
      mainType: "INSTANT",
      colors: [],
      cmc: null,
      gameChanger: false,
      printings: [],
    } as never);
    const out = await getCardBySlug("mystery");
    expect(out).toMatchObject({
      collectorNumber: null,
      setCode: null,
      setName: null,
      imageUri: null,
      cmc: null,
    });
  });

  it("coerces oracleText null → null without throwing", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: 3,
      name: "Plains",
      manaCost: null,
      typeLine: "Basic Land — Plains",
      oracleText: null,
      mainType: "LAND",
      colors: [],
      cmc: 0,
      gameChanger: false,
      printings: [
        {
          imageUri: "/p.webp",
          collectorNumber: "1",
          setCode: "BASE",
          setName: "Basic",
        },
      ],
    } as never);
    const out = await getCardBySlug("plains");
    expect(out!.oracleText).toBeNull();
  });
});

describe("getCardImagesByNames", () => {
  it("returns empty for empty input", async () => {
    expect(await getCardImagesByNames([])).toEqual({});
    expect(mockCardFindMany).not.toHaveBeenCalled();
  });

  it("returns a lowercase-name → imageUri map", async () => {
    mockCardFindMany.mockResolvedValue([
      { name: "Sol Ring", printings: [{ imageUri: "/sol.webp" }] },
      { name: "Counterspell", printings: [{ imageUri: "/cs.webp" }] },
    ] as never);
    expect(await getCardImagesByNames(["Sol Ring", "Counterspell"])).toEqual({
      "sol ring": "/sol.webp",
      counterspell: "/cs.webp",
    });
  });

  it("skips cards whose first printing has no imageUri", async () => {
    mockCardFindMany.mockResolvedValue([
      { name: "Sol Ring", printings: [{ imageUri: null }] },
      { name: "Counterspell", printings: [] },
      { name: "Plains", printings: [{ imageUri: "/p.webp" }] },
    ] as never);
    expect(await getCardImagesByNames(["Sol Ring", "Counterspell", "Plains"])).toEqual({
      plains: "/p.webp",
    });
  });

  it("returns {} when prisma throws (DB unavailable in build env)", async () => {
    mockCardFindMany.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await getCardImagesByNames(["Sol Ring"])).toEqual({});
  });
});

describe("getDecksContainingCard", () => {
  it("returns one entry per matching deckCard", async () => {
    mockDeckCardFindMany.mockResolvedValue([
      {
        quantity: 3,
        deck: { id: "d1", name: "Goblins", format: "MODERN" },
      },
      {
        quantity: 1,
        deck: { id: "d2", name: "Atraxa", format: "COMMANDER" },
      },
    ] as never);
    expect(await getDecksContainingCard("user-1", 7)).toEqual([
      { id: "d1", name: "Goblins", format: "MODERN", copies: 3 },
      { id: "d2", name: "Atraxa", format: "COMMANDER", copies: 1 },
    ]);
  });

  it("returns [] when no decks contain the card", async () => {
    mockDeckCardFindMany.mockResolvedValue([] as never);
    expect(await getDecksContainingCard("user-1", 999)).toEqual([]);
  });
});
