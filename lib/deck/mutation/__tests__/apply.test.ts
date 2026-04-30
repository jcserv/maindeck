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
  // Singleton/legality hard-block is currently disabled in `applyChanges`.
  // These tests are commented out until the gate is re-enabled — see
  // lib/deck/mutation/apply.ts for the toggle.
  // it("throws InvariantViolation for new singleton breach in Commander", async () => {
  //   commanderDeck([{ id: "dc-1", cardId: 1, name: "Sol Ring", quantity: 1 }]);
  //   await expect(
  //     applyChanges(DECK, USER, [
  //       { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
  //     ]),
  //   ).rejects.toThrow(InvariantViolation);
  //   expect(mockTransaction).not.toHaveBeenCalled();
  // });
  //
  // it("throws InvariantViolation when bulk-adding two non-basic copies", async () => {
  //   commanderDeck([]);
  //   mockCardFindMany.mockResolvedValue([
  //     {
  //       id: 1,
  //       name: "Sol Ring",
  //       typeLine: "Artifact",
  //       colorIdentity: [],
  //       legalities: { commander: "legal" },
  //     },
  //   ] as never);
  //   await expect(
  //     applyChanges(DECK, USER, [
  //       { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, category: null },
  //     ]),
  //   ).rejects.toThrow(InvariantViolation);
  // });

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
});
