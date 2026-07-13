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
    deckCategory: { findMany: vi.fn() },
    deckCardCategory: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
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
const mockCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockLinkDeleteMany = vi.mocked(prisma.deckCardCategory.deleteMany);
const mockLinkCreateMany = vi.mocked(prisma.deckCardCategory.createMany);
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
        deckCategory: { findMany: mockCategoryFindMany },
        deckCardCategory: {
          deleteMany: mockLinkDeleteMany,
          createMany: mockLinkCreateMany,
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
    categories?: string[];
  }>,
  categoryNames: string[] = [],
) {
  mockDeckFindUnique.mockResolvedValue({
    id: DECK,
    format: Format.COMMANDER,
    cards: cards.map((c) => ({
      id: c.id,
      cardId: c.cardId,
      quantity: c.quantity,
      zone: c.zone ?? Zone.MAINBOARD,
      categoryLinks: (c.categories ?? []).map((name) => ({
        deckCategory: { name },
      })),
      printingId: null,
      isFoil: false,
      card: {
        name: c.name,
        typeLine: c.typeLine ?? "Creature — Human",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    })),
    categories: categoryNames.map((name) => ({ name })),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDeckCardFindFirst.mockResolvedValue(null);
  mockDeckCardCreate.mockResolvedValue({ id: "dc-new" } as never);
  mockDeckCardUpdate.mockResolvedValue({} as never);
  mockDeckCardDelete.mockResolvedValue({} as never);
  mockCategoryFindMany.mockResolvedValue([] as never);
  mockLinkDeleteMany.mockResolvedValue({ count: 0 } as never);
  mockLinkCreateMany.mockResolvedValue({ count: 0 } as never);
  mockRevisionFindFirst.mockResolvedValue(null);
  mockRevisionCreate.mockResolvedValue({} as never);
  mockCardFindMany.mockResolvedValue([] as never);
  txPassthrough();
});

describe("applyChanges — invariant gating", () => {
  it("throws InvariantViolation when categories are set on non-MAINBOARD", async () => {
    commanderDeck([], ["Ramp"]);
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
          categories: ["Ramp"],
        },
      ]),
    ).rejects.toThrow(InvariantViolation);

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("throws InvariantViolation for a category name not on the deck", async () => {
    commanderDeck([], ["Ramp"]);
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
          zone: Zone.MAINBOARD,
          categories: ["Ghost"],
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
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
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
      { op: "add", cardId: 1, quantity: 4, zone: Zone.MAINBOARD, categories: [] },
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
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] }],
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
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] }],
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
    // Quantity-only update never touches membership rows.
    expect(mockLinkDeleteMany).not.toHaveBeenCalled();
    expect(mockLinkCreateMany).not.toHaveBeenCalled();
  });

  it("add hitting an existing matching row updates to the merged quantity instead of creating", async () => {
    commanderDeck([
      { id: "dc-1", cardId: 1, name: "Sol Ring", quantity: 1 },
    ]);

    await applyChanges(DECK, USER, [
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, categories: [] },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { quantity: 3 },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("categorized add creates the row and its membership links with positions 0..n-1", async () => {
    commanderDeck([], ["Ramp", "Rocks"]);
    mockCardFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Sol Ring",
        typeLine: "Artifact",
        colorIdentity: [],
        legalities: { commander: "legal" },
      },
    ] as never);
    mockCategoryFindMany.mockResolvedValue([
      { id: "cat-ramp", name: "Ramp" },
      { id: "cat-rocks", name: "Rocks" },
    ] as never);
    mockDeckCardCreate.mockResolvedValue({ id: "dc-new" } as never);

    await applyChanges(DECK, USER, [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: ["Rocks", "Ramp"],
      },
    ]);

    expect(mockCategoryFindMany).toHaveBeenCalledWith({
      where: { deckId: DECK, name: { in: expect.arrayContaining(["Rocks", "Ramp"]) } },
      select: { id: true, name: true },
    });
    expect(mockLinkCreateMany).toHaveBeenCalledWith({
      data: [
        { deckCardId: "dc-new", deckCategoryId: "cat-rocks", position: 0 },
        { deckCardId: "dc-new", deckCategoryId: "cat-ramp", position: 1 },
      ],
    });
  });

  it("move with no target row updates the row's zone in place", async () => {
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
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, categories: [] },
    ]);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { zone: Zone.SIDEBOARD },
    });
    expect(mockDeckCardDelete).not.toHaveBeenCalled();
  });

  it("move that only changes memberships replaces the link rows, not the deckCard", async () => {
    commanderDeck(
      [
        {
          id: "dc-1",
          cardId: 1,
          name: "Sol Ring",
          quantity: 1,
          zone: Zone.MAINBOARD,
          typeLine: "Artifact",
          categories: ["Rocks"],
        },
      ],
      ["Ramp", "Rocks"],
    );
    mockCategoryFindMany.mockResolvedValue([
      { id: "cat-ramp", name: "Ramp" },
    ] as never);

    await applyChanges(DECK, USER, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: ["Ramp"] },
    ]);

    // Category-only edit still touches the row so @updatedAt reflects it.
    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: {},
    });
    expect(mockLinkDeleteMany).toHaveBeenCalledWith({
      where: { deckCardId: "dc-1" },
    });
    expect(mockLinkCreateMany).toHaveBeenCalledWith({
      data: [{ deckCardId: "dc-1", deckCategoryId: "cat-ramp", position: 0 }],
    });
    // Recategorization is recorded as a zero-delta revision entry.
    expect(mockRevisionCreate).toHaveBeenCalledWith({
      data: {
        deckId: DECK,
        userId: USER,
        changes: [
          {
            cardId: 1,
            cardName: "Sol Ring",
            zone: Zone.MAINBOARD,
            categories: ["Ramp"],
            previousCategories: ["Rocks"],
            delta: 0,
          },
        ],
      },
    });
  });

  it("replacing memberships renumbers positions 0..n-1", async () => {
    commanderDeck(
      [
        {
          id: "dc-1",
          cardId: 1,
          name: "Sol Ring",
          quantity: 1,
          zone: Zone.MAINBOARD,
          typeLine: "Artifact",
          categories: ["Ramp"],
        },
      ],
      ["Ramp", "Rocks", "Staples"],
    );
    mockCategoryFindMany.mockResolvedValue([
      { id: "cat-ramp", name: "Ramp" },
      { id: "cat-rocks", name: "Rocks" },
      { id: "cat-staples", name: "Staples" },
    ] as never);

    await applyChanges(DECK, USER, [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        categories: ["Staples", "Ramp", "Rocks"],
      },
    ]);

    expect(mockLinkDeleteMany).toHaveBeenCalledWith({
      where: { deckCardId: "dc-1" },
    });
    expect(mockLinkCreateMany).toHaveBeenCalledWith({
      data: [
        { deckCardId: "dc-1", deckCategoryId: "cat-staples", position: 0 },
        { deckCardId: "dc-1", deckCategoryId: "cat-ramp", position: 1 },
        { deckCardId: "dc-1", deckCategoryId: "cat-rocks", position: 2 },
      ],
    });
  });

  it("clearing memberships deletes the link rows without recreating any", async () => {
    commanderDeck(
      [
        {
          id: "dc-1",
          cardId: 1,
          name: "Sol Ring",
          quantity: 1,
          zone: Zone.MAINBOARD,
          typeLine: "Artifact",
          categories: ["Ramp"],
        },
      ],
      ["Ramp"],
    );

    await applyChanges(DECK, USER, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: [] },
    ]);

    expect(mockLinkDeleteMany).toHaveBeenCalledWith({
      where: { deckCardId: "dc-1" },
    });
    expect(mockLinkCreateMany).not.toHaveBeenCalled();
  });

  it("throws when a category referenced by an op has vanished from the deck mid-flight", async () => {
    commanderDeck(
      [
        {
          id: "dc-1",
          cardId: 1,
          name: "Sol Ring",
          quantity: 1,
          zone: Zone.MAINBOARD,
          typeLine: "Artifact",
        },
      ],
      ["Ramp"],
    );
    // Structural check passed against the snapshot, but the tx lookup misses.
    mockCategoryFindMany.mockResolvedValue([] as never);

    await expect(
      applyChanges(DECK, USER, [
        { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: ["Ramp"] },
      ]),
    ).rejects.toThrow('Category "Ramp" not found in deck');
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
      { op: "move", deckCardId: "dc-source", zone: Zone.SIDEBOARD, categories: [] },
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

  it("move to the same zone+categories produces no delta but still runs the tx", async () => {
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
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: [] },
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
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] }],
      { skipCacheInvalidation: true },
    );

    expect(mockUpdateTag).not.toHaveBeenCalled();
  });
});

describe("applyChanges — external tx passthrough", () => {
  // Prisma/Postgres don't support nesting real transactions, so when a
  // caller (e.g. proposal approval) already holds a `tx`, `applyChanges`
  // must run everything — including the pre-transaction snapshot read —
  // against that same client instead of opening its own.
  function externalTx(cards: Array<{ id: string; cardId: number; name: string; quantity: number }>) {
    return {
      deck: {
        findUnique: vi.fn().mockResolvedValue({
          id: DECK,
          format: Format.COMMANDER,
          cards: cards.map((c) => ({
            id: c.id,
            cardId: c.cardId,
            quantity: c.quantity,
            zone: Zone.MAINBOARD,
            categoryLinks: [],
            printingId: null,
            isFoil: false,
            card: {
              name: c.name,
              typeLine: "Artifact",
              colorIdentity: [],
              legalities: { commander: "legal" },
            },
          })),
          categories: [],
        }),
      },
      card: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            name: "Sol Ring",
            typeLine: "Artifact",
            colorIdentity: [],
            legalities: { commander: "legal" },
          },
        ]),
      },
      deckCard: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "dc-ext" }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      deckCategory: { findMany: vi.fn().mockResolvedValue([]) },
      deckCardCategory: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      deckRevision: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it("runs the snapshot read and the writes against the caller's tx, and never opens its own transaction", async () => {
    const tx = externalTx([]);

    await applyChanges(
      DECK,
      USER,
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] }],
      { tx: tx as never },
    );

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.deck.findUnique).toHaveBeenCalled();
    expect(tx.deckCard.create).toHaveBeenCalled();
    expect(tx.deckRevision.create).toHaveBeenCalled();
    // The global client (what prisma.$transaction would have handed back
    // as its own `tx`) must never see these calls.
    expect(mockDeckFindUnique).not.toHaveBeenCalled();
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
    expect(mockRevisionCreate).not.toHaveBeenCalled();
  });

  it("still opens its own transaction when opts.tx is omitted", async () => {
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
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
