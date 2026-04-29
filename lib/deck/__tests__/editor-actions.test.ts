import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/deck/revision-recorder", () => ({
  recordDeckRevision: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    card: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    deckCard: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Format, Zone } from "@/lib/generated/prisma/client";
import {
  addCardToDeck,
  bulkUpdateDeck,
  removeCardFromDeck,
  updateCardQuantity,
} from "../editor-actions";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckCardFindUnique = vi.mocked(prisma.deckCard.findUnique);
const mockDeckCardFindFirst = vi.mocked(prisma.deckCard.findFirst);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockDeckCardCreate = vi.mocked(prisma.deckCard.create);
const mockDeckCardUpdate = vi.mocked(prisma.deckCard.update);
const mockDeckCardDelete = vi.mocked(prisma.deckCard.delete);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const DECK_ID = "deck-1";

function asOwner() {
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
}

function asOutsider() {
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);
}

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
      };
      return fn(tx);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// addCardToDeck
// ---------------------------------------------------------------------------

describe("addCardToDeck", () => {
  it("creates a new row when no matching (cardId, zone, category) exists", async () => {
    asOwner();
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);

    await addCardToDeck(DECK_ID, 42, { category: "Ramp" });

    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: {
        deckId: DECK_ID,
        cardId: 42,
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: "Ramp",
      },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("increments quantity on the existing row when one matches", async () => {
    asOwner();
    mockDeckCardFindFirst.mockResolvedValue({ id: "dc-existing" } as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);

    await addCardToDeck(DECK_ID, 42, { quantity: 3 });

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-existing" },
      data: { quantity: { increment: 3 } },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("no-ops when adding a duplicate non-basic-land to a Commander deck", async () => {
    asOwner();
    mockDeckCardFindFirst.mockResolvedValue({ id: "dc-existing" } as never);
    mockDeckFindUnique.mockResolvedValueOnce({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValueOnce({
      format: Format.COMMANDER,
      cards: [{ card: { typeLine: "Legendary Creature — Elf" } }],
    } as never);

    await addCardToDeck(DECK_ID, 42);

    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("still increments basic lands in a Commander deck", async () => {
    asOwner();
    mockDeckCardFindFirst.mockResolvedValue({ id: "dc-forest" } as never);
    mockDeckFindUnique.mockResolvedValueOnce({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValueOnce({
      format: Format.COMMANDER,
      cards: [{ card: { typeLine: "Basic Land — Forest" } }],
    } as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);

    await addCardToDeck(DECK_ID, 42);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-forest" },
      data: { quantity: { increment: 1 } },
    });
  });

  it("uses a single combined query (no separate prisma.card lookup) for the Commander singleton check", async () => {
    asOwner();
    mockDeckCardFindFirst.mockResolvedValue({ id: "dc-existing" } as never);
    mockDeckFindUnique.mockResolvedValueOnce({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValueOnce({
      format: Format.COMMANDER,
      cards: [{ card: { typeLine: "Legendary Creature — Elf" } }],
    } as never);

    await addCardToDeck(DECK_ID, 42);

    // requireDeckOwner + combined deck+card select = 2 deck lookups, 0 card lookups
    expect(mockDeckFindUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects a category on a non-MAINBOARD zone", async () => {
    asOwner();

    await expect(
      addCardToDeck(DECK_ID, 42, { zone: Zone.SIDEBOARD, category: "Ramp" }),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(addCardToDeck(DECK_ID, 42)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeCardFromDeck
// ---------------------------------------------------------------------------

describe("removeCardFromDeck", () => {
  it("deletes the row for a matching deckCard", async () => {
    asOwner();
    mockDeckCardFindUnique.mockResolvedValue({ deckId: DECK_ID } as never);
    mockDeckCardDelete.mockResolvedValue({} as never);

    await removeCardFromDeck(DECK_ID, "dc-1");

    expect(mockDeckCardDelete).toHaveBeenCalledWith({ where: { id: "dc-1" } });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("throws if the deckCard does not exist", async () => {
    asOwner();
    mockDeckCardFindUnique.mockResolvedValue(null);

    await expect(removeCardFromDeck(DECK_ID, "dc-1")).rejects.toThrow(
      "Not found or unauthorized",
    );
    expect(mockDeckCardDelete).not.toHaveBeenCalled();
  });

  it("throws if the deckCard belongs to a different deck", async () => {
    asOwner();
    mockDeckCardFindUnique.mockResolvedValue({ deckId: "other-deck" } as never);

    await expect(removeCardFromDeck(DECK_ID, "dc-1")).rejects.toThrow(
      "Not found or unauthorized",
    );
    expect(mockDeckCardDelete).not.toHaveBeenCalled();
  });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(removeCardFromDeck(DECK_ID, "dc-1")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// updateCardQuantity
// ---------------------------------------------------------------------------

describe("updateCardQuantity", () => {
  it("updates quantity for a positive value", async () => {
    asOwner();
    mockDeckCardFindUnique.mockResolvedValue({ deckId: DECK_ID } as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);

    await updateCardQuantity(DECK_ID, "dc-1", 4);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { quantity: 4 },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("deletes the row when quantity is <= 0", async () => {
    asOwner();
    mockDeckCardFindUnique.mockResolvedValue({ deckId: DECK_ID } as never);
    mockDeckCardDelete.mockResolvedValue({} as never);

    await updateCardQuantity(DECK_ID, "dc-1", 0);

    expect(mockDeckCardDelete).toHaveBeenCalledWith({ where: { id: "dc-1" } });
    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });

  it("throws when deckCard belongs to a different deck", async () => {
    asOwner();
    mockDeckCardFindUnique.mockResolvedValue({ deckId: "other-deck" } as never);

    await expect(updateCardQuantity(DECK_ID, "dc-1", 2)).rejects.toThrow(
      "Not found or unauthorized",
    );
  });

  it("short-circuits when the requested quantity matches the existing quantity", async () => {
    asOwner();
    mockDeckCardFindUnique.mockResolvedValue({
      deckId: DECK_ID,
      cardId: 1,
      quantity: 3,
      zone: Zone.MAINBOARD,
      category: null,
    } as never);

    await updateCardQuantity(DECK_ID, "dc-1", 3);

    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
    expect(mockDeckCardDelete).not.toHaveBeenCalled();
  });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(updateCardQuantity(DECK_ID, "dc-1", 2)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// bulkUpdateDeck
// ---------------------------------------------------------------------------

describe("bulkUpdateDeck", () => {
  it("404s for non-owners", async () => {
    asOutsider();

    await expect(
      bulkUpdateDeck(DECK_ID, [
        { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
      ]),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects atomically if any referenced deckCard is not in this deck", async () => {
    asOwner();
    // Bulk references dc-1, but Prisma only returns rows scoped to this deck — empty.
    mockDeckCardFindMany.mockResolvedValue([] as never);

    await expect(
      bulkUpdateDeck(DECK_ID, [
        { op: "remove", deckCardId: "dc-1" },
        { op: "add", cardId: 99, quantity: 1, zone: Zone.MAINBOARD, category: null },
      ]),
    ).rejects.toThrow("Not found or unauthorized");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
    expect(mockDeckCardDelete).not.toHaveBeenCalled();
  });

  it("applies add/remove/update op types in a single transaction", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([
      { id: "dc-1", cardId: 1, zone: Zone.MAINBOARD, category: null, quantity: 1 },
      { id: "dc-2", cardId: 2, zone: Zone.MAINBOARD, category: null, quantity: 2 },
    ] as never);
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);
    mockDeckCardDelete.mockResolvedValue({} as never);
    txPassthrough();

    await bulkUpdateDeck(DECK_ID, [
      { op: "add", cardId: 99, quantity: 1, zone: Zone.MAINBOARD, category: null },
      { op: "remove", deckCardId: "dc-1" },
      { op: "update", deckCardId: "dc-2", quantity: 4 },
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: {
        deckId: DECK_ID,
        cardId: 99,
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: null,
      },
    });
    expect(mockDeckCardDelete).toHaveBeenCalledWith({ where: { id: "dc-1" } });
    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-2" },
      data: { quantity: 4 },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("move preserves category only when target zone is MAINBOARD", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([
      {
        id: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        category: "Ramp",
        quantity: 1,
      },
    ] as never);
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardUpdate.mockResolvedValue({} as never);
    txPassthrough();

    // Caller is responsible for passing null category to non-MAINBOARD zones;
    // verify the action passes the category through as given.
    await bulkUpdateDeck(DECK_ID, [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.SIDEBOARD,
        category: null,
      },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { zone: Zone.SIDEBOARD, category: null },
    });
  });

  it("move merges into an existing (cardId, zone, category) row", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([
      {
        id: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        category: "Ramp",
        quantity: 2,
      },
    ] as never);
    // Moving into a zone/category that already has card 1.
    mockDeckCardFindFirst.mockResolvedValue({
      id: "dc-target",
      quantity: 3,
    } as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);
    mockDeckCardDelete.mockResolvedValue({} as never);
    txPassthrough();

    await bulkUpdateDeck(DECK_ID, [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        category: "Removal",
      },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-target" },
      data: { quantity: { increment: 2 } },
    });
    expect(mockDeckCardDelete).toHaveBeenCalledWith({ where: { id: "dc-1" } });
  });

  it("rejects add with category on a non-MAINBOARD zone", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([] as never);
    txPassthrough();

    await expect(
      bulkUpdateDeck(DECK_ID, [
        {
          op: "add",
          cardId: 1,
          quantity: 1,
          zone: Zone.SIDEBOARD,
          category: "Ramp",
        },
      ]),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
  });

  it("add op increments quantity when a matching row already exists", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([] as never);
    mockDeckCardFindFirst.mockResolvedValue({ id: "dc-existing" } as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);
    txPassthrough();

    await bulkUpdateDeck(DECK_ID, [
      {
        op: "add",
        cardId: 7,
        quantity: 2,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-existing" },
      data: { quantity: { increment: 2 } },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("is a no-op when a move targets the same zone and category", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([
      {
        id: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        category: "Ramp",
        quantity: 2,
      },
    ] as never);
    // The move lookup inside the transaction returns the same row — the
    // action's own preserve-in-place branch updates it with identical zone/
    // category. No delta is produced for the revision recorder.
    mockDeckCardFindFirst.mockResolvedValue({
      id: "dc-1",
      quantity: 2,
    } as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);
    txPassthrough();

    const { recordDeckRevision } = await import("@/lib/deck/revision-recorder");

    await bulkUpdateDeck(DECK_ID, [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        category: "Ramp",
      },
    ]);

    // computeBulkDeltas short-circuits on the same-zone/same-category guard →
    // deltas is empty → recorder is skipped entirely.
    expect(vi.mocked(recordDeckRevision)).not.toHaveBeenCalled();
  });

  it("aggregates multiple changes that target the same (cardId, zone, category)", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([] as never);
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);
    mockDeckCardUpdate.mockResolvedValue({} as never);
    txPassthrough();
    vi.mocked(prisma.card.findMany).mockResolvedValue([
      { id: 7, name: "Sol Ring" },
    ] as never);

    await bulkUpdateDeck(DECK_ID, [
      { op: "add", cardId: 7, quantity: 2, zone: Zone.MAINBOARD, category: null },
      { op: "add", cardId: 7, quantity: 3, zone: Zone.MAINBOARD, category: null },
    ]);

    const { recordDeckRevision } = await import("@/lib/deck/revision-recorder");
    expect(vi.mocked(recordDeckRevision)).toHaveBeenCalledWith(
      DECK_ID,
      USER_ID,
      [
        expect.objectContaining({
          cardId: 7,
          zone: Zone.MAINBOARD,
          category: null,
          delta: 5,
          cardName: "Sol Ring",
        }),
      ],
    );
  });

  it("update op deletes the row when quantity <= 0", async () => {
    asOwner();
    mockDeckCardFindMany.mockResolvedValue([
      { id: "dc-1", cardId: 1, zone: Zone.MAINBOARD, category: null, quantity: 2 },
    ] as never);
    mockDeckCardDelete.mockResolvedValue({} as never);
    txPassthrough();

    await bulkUpdateDeck(DECK_ID, [
      { op: "update", deckCardId: "dc-1", quantity: 0 },
    ]);

    expect(mockDeckCardDelete).toHaveBeenCalledWith({ where: { id: "dc-1" } });
    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });
});
