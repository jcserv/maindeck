import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
    card: { findMany: vi.fn() },
    deckCard: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    deckRevision: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { applyChanges, InvariantViolation } from "../index";

const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockDeckCardFindFirst = vi.mocked(prisma.deckCard.findFirst);
const mockDeckCardCreate = vi.mocked(prisma.deckCard.create);
const mockDeckCardUpdate = vi.mocked(prisma.deckCard.update);
const mockDeckCardDelete = vi.mocked(prisma.deckCard.delete);
const mockRevisionFindFirst = vi.mocked(prisma.deckRevision.findFirst);
const mockRevisionCreate = vi.mocked(prisma.deckRevision.create);
const mockTransaction = vi.mocked(prisma.$transaction);

const USER = "user-1";
const DECK = "deck-1";

function txPassthrough() {
  mockTransaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") {
      const tx = {
        deckCard: {
          findFirst: mockDeckCardFindFirst,
          create: mockDeckCardCreate,
          update: mockDeckCardUpdate,
          delete: mockDeckCardDelete,
        },
        deckRevision: {
          findFirst: mockRevisionFindFirst,
          create: mockRevisionCreate,
          update: vi.mocked(prisma.deckRevision.update),
          delete: vi.mocked(prisma.deckRevision.delete),
        },
      };
      return fn(tx);
    }
  });
}

function commanderDeck(
  cards: Array<{
    id: string;
    cardId: number;
    name: string;
    quantity: number;
    zone?: Zone;
    typeLine?: string | null;
  }>,
) {
  mockDeckFindUnique.mockResolvedValue({
    id: DECK,
    format: Format.COMMANDER,
    cards: cards.map((c) => ({
      id: c.id,
      cardId: c.cardId,
      quantity: c.quantity,
      zone: c.zone ?? Zone.MAINBOARD,
      category: null,
      printingId: null,
      isFoil: false,
      card: {
        name: c.name,
        typeLine: c.typeLine ?? "Creature — Human",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    })),
    categories: [],
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDeckCardFindFirst.mockResolvedValue(null);
  mockDeckCardCreate.mockResolvedValue({} as never);
  mockDeckCardUpdate.mockResolvedValue({} as never);
  mockDeckCardDelete.mockResolvedValue({} as never);
  mockRevisionFindFirst.mockResolvedValue(null);
  mockRevisionCreate.mockResolvedValue({} as never);
  mockCardFindMany.mockResolvedValue([] as never);
  txPassthrough();
});

describe("applyChanges — invariant gating", () => {
  it("throws InvariantViolation when category is set on non-MAINBOARD", async () => {
    commanderDeck([]);
    mockCardFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Sol Ring",
        typeLine: "Artifact",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    ] as never);

    await expect(
      applyChanges(DECK, USER, [
        {
          op: "add",
          cardId: 1,
          quantity: 1,
          zone: Zone.SIDEBOARD,
          category: "Ramp",
        },
      ]),
    ).rejects.toThrow(InvariantViolation);

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("permits valid add and runs the tx", async () => {
    commanderDeck([]);
    mockCardFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Sol Ring",
        typeLine: "Artifact",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    ] as never);

    await applyChanges(DECK, USER, [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeckCardCreate).toHaveBeenCalled();
    expect(mockRevisionCreate).toHaveBeenCalled();
  });

  it("does not flag a basic land duplicate (Forest 5 copies)", async () => {
    commanderDeck([
      {
        id: "dc-1",
        cardId: 1,
        name: "Forest",
        quantity: 1,
        typeLine: "Basic Land — Forest",
      },
    ]);

    await applyChanges(DECK, USER, [
      { op: "add", cardId: 1, quantity: 4, zone: Zone.MAINBOARD, category: null },
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("applyChanges — revision atomicity", () => {
  it("rolls back the mutation when revision write fails inside tx", async () => {
    commanderDeck([{ id: "dc-1", cardId: 1, name: "Sol Ring", quantity: 1 }]);

    mockRevisionCreate.mockRejectedValue(new Error("revision write failed"));

    await expect(
      applyChanges(DECK, USER, [
        { op: "remove", deckCardId: "dc-1" },
      ]),
    ).rejects.toThrow("revision write failed");

    // Tx invoked, but the rejection propagates — Prisma would roll the tx back.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("forwards skipMerge: true to recordDeckRevisionTx (creates fresh revision even within window)", async () => {
    commanderDeck([]);
    mockCardFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Sol Ring",
        typeLine: "Artifact",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    ] as never);
    // Recent revision exists — would normally trigger merge path.
    mockRevisionFindFirst.mockResolvedValue({
      id: "rev-recent",
      updatedAt: new Date(Date.now() - 30_000),
      changes: [],
    } as never);

    await applyChanges(
      DECK,
      USER,
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null }],
      { skipMerge: true },
    );

    // skipMerge short-circuits the findFirst lookup entirely.
    expect(mockRevisionFindFirst).not.toHaveBeenCalled();
    expect(mockRevisionCreate).toHaveBeenCalledTimes(1);
  });

  it("skips revision write when skipRevision: true", async () => {
    commanderDeck([]);
    mockCardFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Sol Ring",
        typeLine: "Artifact",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    ] as never);

    await applyChanges(
      DECK,
      USER,
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null }],
      { skipRevision: true },
    );

    expect(mockRevisionCreate).not.toHaveBeenCalled();
    expect(mockDeckCardCreate).toHaveBeenCalled();
  });
});

describe("applyChanges — basic ops", () => {
  it("update with q=0 deletes the row", async () => {
    commanderDeck([{ id: "dc-1", cardId: 1, name: "Forest", quantity: 4 }]);

    await applyChanges(DECK, USER, [
      { op: "update", deckCardId: "dc-1", quantity: 0 },
    ]);

    expect(mockDeckCardDelete).toHaveBeenCalledWith({ where: { id: "dc-1" } });
  });

  it("noops on empty change array", async () => {
    await applyChanges(DECK, USER, []);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDeckFindUnique).not.toHaveBeenCalled();
  });

  it("update with positive quantity calls deckCard.update with the new quantity", async () => {
    commanderDeck([{ id: "dc-1", cardId: 1, name: "Forest", quantity: 2 }]);

    await applyChanges(DECK, USER, [
      { op: "update", deckCardId: "dc-1", quantity: 7 },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { quantity: 7 },
    });
    expect(mockDeckCardDelete).not.toHaveBeenCalled();
  });

  it("add hitting an existing matching row updates to the merged quantity instead of creating", async () => {
    commanderDeck([
      { id: "dc-1", cardId: 1, name: "Sol Ring", quantity: 1 },
    ]);

    await applyChanges(DECK, USER, [
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, category: null },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { quantity: 3 },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("move with no target row updates the row's zone/category in place", async () => {
    commanderDeck([
      {
        id: "dc-1",
        cardId: 1,
        name: "Sol Ring",
        quantity: 1,
        typeLine: "Artifact",
      },
    ]);
    await applyChanges(DECK, USER, [
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, category: null },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { zone: Zone.SIDEBOARD },
    });
    expect(mockDeckCardDelete).not.toHaveBeenCalled();
  });

  it("move that lands on an existing target merges quantity and deletes the source", async () => {
    commanderDeck([
      {
        id: "dc-source",
        cardId: 1,
        name: "Sol Ring",
        quantity: 2,
        zone: Zone.MAINBOARD,
        typeLine: "Artifact",
      },
      {
        id: "dc-target",
        cardId: 1,
        name: "Sol Ring",
        quantity: 1,
        zone: Zone.SIDEBOARD,
        typeLine: "Artifact",
      },
    ]);
    await applyChanges(DECK, USER, [
      { op: "move", deckCardId: "dc-source", zone: Zone.SIDEBOARD, category: null },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-target" },
      data: { quantity: 3 },
    });
    expect(mockDeckCardDelete).toHaveBeenCalledWith({
      where: { id: "dc-source" },
    });
  });

  it("rejects mutations referencing a deckCardId not on the deck", async () => {
    commanderDeck([{ id: "dc-1", cardId: 1, name: "Sol Ring", quantity: 1 }]);

    await expect(
      applyChanges(DECK, USER, [
        { op: "update", deckCardId: "dc-not-here", quantity: 4 },
      ]),
    ).rejects.toThrow("Not found or unauthorized");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("move to the same zone+category produces no delta but still runs the tx", async () => {
    commanderDeck([
      {
        id: "dc-1",
        cardId: 1,
        name: "Sol Ring",
        quantity: 1,
        zone: Zone.MAINBOARD,
        typeLine: "Artifact",
      },
    ]);
    mockDeckCardFindFirst.mockResolvedValueOnce(null);

    await applyChanges(DECK, USER, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, category: null },
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Empty delta → no revision row written.
    expect(mockRevisionCreate).not.toHaveBeenCalled();
  });

  it("respects skipCacheInvalidation by not invoking next/cache updateTag", async () => {
    const { updateTag } = await import("next/cache");
    const mockUpdateTag = vi.mocked(updateTag);
    mockUpdateTag.mockClear();

    commanderDeck([]);
    mockCardFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Sol Ring",
        typeLine: "Artifact",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    ] as never);

    await applyChanges(
      DECK,
      USER,
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null }],
      { skipCacheInvalidation: true },
    );

    expect(mockUpdateTag).not.toHaveBeenCalled();
  });
});
