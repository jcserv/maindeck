import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/deck/mutation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deck/mutation")>(
    "@/lib/deck/mutation",
  );
  return {
    ...actual,
    applyChanges: vi.fn(async () => undefined),
  };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    deckCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    deckCard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Zone } from "@/lib/generated/prisma/client";
import { applyChanges, type PlannedChange } from "@/lib/deck/mutation";
import {
  autogenerateCategories,
  createCategory,
  deleteCategory,
  moveCardSubcategory,
  moveCardTo,
  moveCardZone,
  renameCategory,
  reorderCategories,
} from "../categories";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockCategoryFindFirst = vi.mocked(prisma.deckCategory.findFirst);
const mockCategoryFindUnique = vi.mocked(prisma.deckCategory.findUnique);
const mockCategoryCreate = vi.mocked(prisma.deckCategory.create);
const mockCategoryDelete = vi.mocked(prisma.deckCategory.delete);
const mockCategoryUpdate = vi.mocked(prisma.deckCategory.update);
const mockCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockCardFindUnique = vi.mocked(prisma.deckCard.findUnique);
const mockCardUpdateMany = vi.mocked(prisma.deckCard.updateMany);
const mockCardDeleteMany = vi.mocked(prisma.deckCard.deleteMany);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockUpdateTag = vi.mocked(updateTag);
const mockApply = vi.mocked(applyChanges);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

function moveChange(): PlannedChange {
  expect(mockApply).toHaveBeenCalledTimes(1);
  const [, , changes] = mockApply.mock.calls[0]!;
  expect(changes).toHaveLength(1);
  return changes[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "test@test.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
  mockApply.mockResolvedValue(undefined);
});

describe("createCategory", () => {
  it("creates a new Mainboard subcategory (name lowercased) and returns id/name/sortOrder", async () => {
    mockCategoryFindFirst.mockResolvedValue({ sortOrder: 2 } as never);
    mockCategoryCreate.mockResolvedValue({
      id: "cat-1",
      name: "ramp",
      sortOrder: 3,
    } as never);

    const result = await createCategory(DECK_ID, "Ramp");

    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deckId: DECK_ID,
          name: "ramp",
          sortOrder: 3,
        }),
      }),
    );
    expect(result).toEqual({ id: "cat-1", name: "ramp", sortOrder: 3 });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("trims and lowercases name whitespace", async () => {
    mockCategoryFindFirst.mockResolvedValue(null);
    mockCategoryCreate.mockResolvedValue({
      id: "cat-2",
      name: "win-cons",
      sortOrder: 0,
    } as never);

    await createCategory(DECK_ID, "  Win-cons  ");

    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "win-cons" }),
      }),
    );
  });

  it("throws when name is empty", async () => {
    await expect(createCategory(DECK_ID, "   ")).rejects.toThrow(
      "Category name cannot be empty",
    );
    expect(mockCategoryCreate).not.toHaveBeenCalled();
  });

  it("allows zone-named subcategories (no reserved list anymore)", async () => {
    mockCategoryFindFirst.mockResolvedValue(null);
    mockCategoryCreate.mockResolvedValue({
      id: "cat-main",
      name: "Mainboard",
      sortOrder: 0,
    } as never);

    await expect(createCategory(DECK_ID, "Mainboard")).resolves.toEqual({
      id: "cat-main",
      name: "Mainboard",
      sortOrder: 0,
    });
  });

  it("throws when requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other-user" } as never);

    await expect(createCategory(DECK_ID, "Ramp")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockCategoryCreate).not.toHaveBeenCalled();
  });
});

describe("deleteCategory", () => {
  it("nulls out category on matching Mainboard cards and deletes the subcategory", async () => {
    const categoryId = "cat-custom";
    mockCategoryFindUnique.mockResolvedValue({ id: categoryId } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            updateMany: mockCardUpdateMany,
          },
          deckCategory: {
            delete: mockCategoryDelete,
          },
        };
        return fn(tx);
      }
    });

    await deleteCategory(DECK_ID, "Ramp");

    expect(mockCardUpdateMany).toHaveBeenCalledWith({
      where: { deckId: DECK_ID, zone: "MAINBOARD", category: "Ramp" },
      data: { category: null },
    });
    expect(mockCategoryDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: categoryId } }),
    );
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("does NOT touch cards in non-mainboard zones that reference the same name (stale reference preserved)", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-custom" } as never);

    const seenWheres: unknown[] = [];
    mockCardUpdateMany.mockImplementation(((args: unknown) => {
      seenWheres.push((args as { where: unknown }).where);
      return Promise.resolve({ count: 0 }) as never;
    }) as never);
    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: { updateMany: mockCardUpdateMany },
          deckCategory: { delete: mockCategoryDelete },
        };
        return fn(tx);
      }
    });

    await deleteCategory(DECK_ID, "Ramp");

    // Every updateMany call must filter zone=MAINBOARD
    for (const where of seenWheres) {
      expect(where).toMatchObject({ zone: "MAINBOARD" });
    }
  });

  it("throws when category does not exist", async () => {
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(deleteCategory(DECK_ID, "NonExistent")).rejects.toThrow(
      'Category "NonExistent" not found',
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("throws when requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other-user" } as never);

    await expect(deleteCategory(DECK_ID, "Ramp")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("deleteCards mode removes MAINBOARD rows, uncategorizes other zones, deletes the category row", async () => {
    const categoryId = "cat-custom";
    mockCategoryFindUnique.mockResolvedValue({ id: categoryId } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            deleteMany: mockCardDeleteMany,
            updateMany: mockCardUpdateMany,
          },
          deckCategory: {
            delete: mockCategoryDelete,
          },
        };
        return fn(tx);
      }
    });

    await deleteCategory(DECK_ID, "Ramp", "deleteCards");

    expect(mockCardDeleteMany).toHaveBeenCalledWith({
      where: { deckId: DECK_ID, zone: "MAINBOARD", category: "Ramp" },
    });
    expect(mockCardUpdateMany).toHaveBeenCalledWith({
      where: {
        deckId: DECK_ID,
        zone: { not: "MAINBOARD" },
        category: "Ramp",
      },
      data: { category: null },
    });
    expect(mockCategoryDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: categoryId } }),
    );
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("rejects an invalid mode value", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-1" } as never);

    await expect(
      deleteCategory(DECK_ID, "Ramp", "nuke" as never),
    ).rejects.toThrow();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("renameCategory", () => {
  it("renames the subcategory row and all DeckCard rows (any zone) referencing it (new name lowercased)", async () => {
    mockCategoryFindUnique
      .mockResolvedValueOnce({ id: "cat-ramp" } as never) // old exists
      .mockResolvedValueOnce(null as never); // no conflict

    mockTransaction.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
    });

    await renameCategory(DECK_ID, "ramp", "Acceleration");

    expect(mockCategoryUpdate).toHaveBeenCalledWith({
      where: { id: "cat-ramp" },
      data: { name: "acceleration" },
    });
    expect(mockCardUpdateMany).toHaveBeenCalledWith({
      where: { deckId: DECK_ID, category: "ramp" },
      data: { category: "acceleration" },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("is a no-op when new name equals old name (after lowercasing)", async () => {
    await renameCategory(DECK_ID, "ramp", "Ramp");
    // No DB write: the body returns early before opening a transaction.
    expect(mockTransaction).not.toHaveBeenCalled();
    // The mutation runner still emits the deck tag on successful return; a
    // benign cache bust is preferable to a body opt-out signal.
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("throws when new name is empty", async () => {
    await expect(renameCategory(DECK_ID, "ramp", "   ")).rejects.toThrow(
      "Category name cannot be empty",
    );
  });

  it("throws when the target name already exists", async () => {
    mockCategoryFindUnique
      .mockResolvedValueOnce({ id: "cat-ramp" } as never)
      .mockResolvedValueOnce({ id: "cat-existing" } as never);

    await expect(
      renameCategory(DECK_ID, "ramp", "Removal"),
    ).rejects.toThrow('Category "removal" already exists');
  });

  it("throws when the source category does not exist", async () => {
    mockCategoryFindUnique.mockResolvedValueOnce(null as never);

    await expect(renameCategory(DECK_ID, "Missing", "New")).rejects.toThrow(
      'Category "Missing" not found',
    );
  });
});

describe("reorderCategories", () => {
  it("updates sortOrder for each category in order (input lowercased to match canonical form)", async () => {
    const categories = [
      { id: "cat-1", name: "ramp" },
      { id: "cat-2", name: "removal" },
      { id: "cat-3", name: "win-cons" },
    ];
    mockCategoryFindMany.mockResolvedValue(categories as never);

    mockTransaction.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
    });

    await reorderCategories(DECK_ID, ["Win-cons", "Ramp", "Removal"]);

    expect(mockCategoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cat-3" }, data: { sortOrder: 0 } }),
    );
    expect(mockCategoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cat-1" }, data: { sortOrder: 1 } }),
    );
    expect(mockCategoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cat-2" }, data: { sortOrder: 2 } }),
    );
  });

  it("throws when an ordered name is not found in the deck", async () => {
    mockCategoryFindMany.mockResolvedValue([
      { id: "cat-1", name: "ramp" },
    ] as never);

    await expect(
      reorderCategories(DECK_ID, ["Ramp", "Ghost"]),
    ).rejects.toThrow('Category "ghost" not found in deck');
  });
});

describe("moveCardZone", () => {
  it("preserves the original category string when moving out of MAINBOARD", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 2,
      zone: Zone.MAINBOARD,
      category: "Ramp",
    } as never);

    await moveCardZone(DECK_ID, "dc-1", Zone.SIDEBOARD);

    // Category snaps to null for non-MAINBOARD zones (subcategories are mainboard-only).
    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.SIDEBOARD,
      category: null,
    });
  });

  it("falls back to category=null when returning to MAINBOARD with a stale subcategory", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.SIDEBOARD,
      category: "DeletedRamp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await moveCardZone(DECK_ID, "dc-1", Zone.MAINBOARD);

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      category: null,
    });
  });

  it("snaps back to original subcategory on Mainboard return when subcategory still exists", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.SIDEBOARD,
      category: "Ramp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardZone(DECK_ID, "dc-1", Zone.MAINBOARD);

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      category: "Ramp",
    });
  });

  it("is a no-op when the card is already in the target zone", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: null,
    } as never);

    await moveCardZone(DECK_ID, "dc-1", Zone.MAINBOARD);

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when the deck card does not belong to this deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: "other-deck",
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: null,
    } as never);

    await expect(moveCardZone(DECK_ID, "dc-1", Zone.SIDEBOARD)).rejects.toThrow(
      "Card not found or unauthorized",
    );
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("moveCardSubcategory", () => {
  it("changes subcategory on a MAINBOARD card and lowercases the target", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 2,
      zone: Zone.MAINBOARD,
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardSubcategory(DECK_ID, "dc-1", "Ramp");

    expect(mockCategoryFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_name: { deckId: DECK_ID, name: "ramp" } },
      }),
    );
    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      category: "ramp",
    });
  });

  it("allows passing null to uncategorize", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: "ramp",
    } as never);

    await moveCardSubcategory(DECK_ID, "dc-1", null);

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      category: null,
    });
  });

  it("rejects calls on non-MAINBOARD cards", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.SIDEBOARD,
      category: null,
    } as never);

    await expect(
      moveCardSubcategory(DECK_ID, "dc-1", "Ramp"),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("throws when target subcategory does not exist in the deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(
      moveCardSubcategory(DECK_ID, "dc-1", "Ghost"),
    ).rejects.toThrow('Category "ghost" not found in deck');
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("is a no-op when card already has the target subcategory", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: "ramp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardSubcategory(DECK_ID, "dc-1", "Ramp");

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when the deck card belongs to a different deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: "other-deck",
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: null,
    } as never);

    await expect(
      moveCardSubcategory(DECK_ID, "dc-1", "Ramp"),
    ).rejects.toThrow("Card not found or unauthorized");
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("moveCardTo", () => {
  it("forwards a move to MAINBOARD with the requested subcategory (lowercased)", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.SIDEBOARD,
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, "Ramp");

    expect(mockCategoryFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_name: { deckId: DECK_ID, name: "ramp" } },
      }),
    );
    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      category: "ramp",
    });
  });

  it("rejects a non-null category on a non-MAINBOARD zone", async () => {
    await expect(
      moveCardTo(DECK_ID, "dc-1", Zone.SIDEBOARD, "Ramp"),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockCardFindUnique).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("throws when the target subcategory does not exist", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.SIDEBOARD,
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(
      moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, "Ghost"),
    ).rejects.toThrow('Category "ghost" not found in deck');
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("is a no-op when card is already in the target zone and category", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: "ramp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, "Ramp");

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when the deck card belongs to a different deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: "other-deck",
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: null,
    } as never);

    await expect(
      moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, null),
    ).rejects.toThrow("Card not found or unauthorized");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("moves a MAINBOARD card to a non-MAINBOARD zone with null category (skips category-existence check)", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: "Ramp",
    } as never);

    await moveCardTo(DECK_ID, "dc-1", Zone.SIDEBOARD, null);

    // The category lookup is mainboard-only, so it should not be queried here.
    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledTimes(1);
    const [, , changes] = mockApply.mock.calls[0]!;
    expect(changes[0]).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.SIDEBOARD,
      category: null,
    });
  });
});

describe("autogenerateCategories", () => {
  function uncategorizedRow(
    id: string,
    card: { mainType: string; oracleText?: string | null; keywords?: string[] },
  ) {
    return {
      id,
      card: {
        mainType: card.mainType,
        oracleText: card.oracleText ?? null,
        keywords: card.keywords ?? [],
      },
    };
  }

  it("byType: groups uncategorized mainboard cards by mainType, creates categories, and bulk-assigns them", async () => {
    mockCardFindMany.mockResolvedValue([
      uncategorizedRow("dc-1", { mainType: "Creature" }),
      uncategorizedRow("dc-2", { mainType: "Creature" }),
      uncategorizedRow("dc-3", { mainType: "Instant" }),
      uncategorizedRow("dc-4", { mainType: "Land" }),
    ] as never);
    mockCategoryFindUnique.mockResolvedValue(null);
    mockCategoryFindFirst.mockResolvedValue(null);
    mockCategoryCreate.mockResolvedValue({ id: "any" } as never);
    mockCardUpdateMany.mockResolvedValue({ count: 0 } as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId: DECK_ID, zone: Zone.MAINBOARD, category: null },
      }),
    );
    const createdNames = mockCategoryCreate.mock.calls.map(
      ([arg]) => (arg as { data: { name: string } }).data.name,
    );
    expect(createdNames.sort()).toEqual(["creatures", "instants", "lands"]);

    const updates = mockCardUpdateMany.mock.calls.map(([arg]) => arg);
    const creaturesUpdate = updates.find(
      (u) => (u as { data: { category: string } }).data.category === "creatures",
    ) as { where: { id: { in: string[] } } } | undefined;
    expect(creaturesUpdate?.where.id.in.sort()).toEqual(["dc-1", "dc-2"]);
    expect(mockCardUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: null }),
      }),
    );

    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("byType: skips cards with exotic mainType (classifier returns null)", async () => {
    mockCardFindMany.mockResolvedValue([
      uncategorizedRow("dc-1", { mainType: "Conspiracy" }),
    ] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryCreate).not.toHaveBeenCalled();
    expect(mockCardUpdateMany).not.toHaveBeenCalled();
  });

  it("byType: reuses an existing DeckCategory row instead of creating a duplicate", async () => {
    mockCardFindMany.mockResolvedValue([
      uncategorizedRow("dc-1", { mainType: "Creature" }),
    ] as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-existing" } as never);
    mockCardUpdateMany.mockResolvedValue({ count: 1 } as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryFindUnique).toHaveBeenCalledWith({
      where: { deckId_name: { deckId: DECK_ID, name: "creatures" } },
      select: { id: true },
    });
    expect(mockCategoryCreate).not.toHaveBeenCalled();
    expect(mockCardUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("byType: assigns sortOrder = max+1 when creating a new category alongside existing ones", async () => {
    mockCardFindMany.mockResolvedValue([
      uncategorizedRow("dc-1", { mainType: "Creature" }),
    ] as never);
    mockCategoryFindUnique.mockResolvedValue(null);
    mockCategoryFindFirst.mockResolvedValue({ sortOrder: 4 } as never);
    mockCategoryCreate.mockResolvedValue({ id: "cat-new" } as never);
    mockCardUpdateMany.mockResolvedValue({ count: 1 } as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deckId: DECK_ID,
          name: "creatures",
          sortOrder: 5,
        }),
      }),
    );
  });

  it("commanderTemplate: routes by oracle-text heuristic (Lands / Ramp / Removal / Card advantage / Gameplan)", async () => {
    mockCardFindMany.mockResolvedValue([
      uncategorizedRow("dc-land", { mainType: "Land" }),
      uncategorizedRow("dc-ramp", {
        mainType: "Artifact",
        oracleText: "Tap: Add {C}{C}.",
      }),
      uncategorizedRow("dc-wipe", {
        mainType: "Sorcery",
        oracleText: "Destroy all creatures.",
      }),
      uncategorizedRow("dc-removal", {
        mainType: "Instant",
        oracleText: "Destroy target creature.",
      }),
      uncategorizedRow("dc-draw", {
        mainType: "Instant",
        oracleText: "Draw two cards.",
      }),
      uncategorizedRow("dc-misc", {
        mainType: "Creature",
        oracleText: "Flying.",
      }),
    ] as never);
    mockCategoryFindUnique.mockResolvedValue(null);
    mockCategoryFindFirst.mockResolvedValue(null);
    mockCategoryCreate.mockResolvedValue({ id: "any" } as never);
    mockCardUpdateMany.mockResolvedValue({ count: 1 } as never);

    await autogenerateCategories(DECK_ID, "commanderTemplate");

    const updates = mockCardUpdateMany.mock.calls.map(([arg]) => arg) as Array<{
      where: { id: { in: string[] } };
      data: { category: string };
    }>;
    const byCategory = new Map(updates.map((u) => [u.data.category, u.where.id.in]));

    expect(byCategory.get("lands")).toEqual(["dc-land"]);
    expect(byCategory.get("ramp")).toEqual(["dc-ramp"]);
    expect(byCategory.get("boardwipes")).toEqual(["dc-wipe"]);
    expect(byCategory.get("removal")).toEqual(["dc-removal"]);
    expect(byCategory.get("card advantage")).toEqual(["dc-draw"]);
    expect(byCategory.get("gameplan")).toEqual(["dc-misc"]);
  });

  it("returns early without writes when there are no uncategorized cards", async () => {
    mockCardFindMany.mockResolvedValue([] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    expect(mockCategoryCreate).not.toHaveBeenCalled();
    expect(mockCardUpdateMany).not.toHaveBeenCalled();
  });

  it("returns early without category writes when every card classifies to null", async () => {
    mockCardFindMany.mockResolvedValue([
      uncategorizedRow("dc-1", { mainType: "Conspiracy" }),
      uncategorizedRow("dc-2", { mainType: "Dungeon" }),
    ] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    expect(mockCategoryCreate).not.toHaveBeenCalled();
    expect(mockCardUpdateMany).not.toHaveBeenCalled();
  });

  it("throws when the requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other-user" } as never);

    await expect(autogenerateCategories(DECK_ID, "byType")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockCardFindMany).not.toHaveBeenCalled();
  });
});
