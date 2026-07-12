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
      createMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    deckCard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
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
  moveCardTo,
  moveCardZone,
  moveCategoryCards,
  renameCategory,
  reorderCategories,
  setCardCategories,
} from "../categories";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockCategoryFindFirst = vi.mocked(prisma.deckCategory.findFirst);
const mockCategoryFindUnique = vi.mocked(prisma.deckCategory.findUnique);
const mockCategoryCreate = vi.mocked(prisma.deckCategory.create);
const mockCategoryCreateMany = vi.mocked(prisma.deckCategory.createMany);
const mockCategoryDelete = vi.mocked(prisma.deckCategory.delete);
const mockCategoryUpdate = vi.mocked(prisma.deckCategory.update);
const mockCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockCardFindUnique = vi.mocked(prisma.deckCard.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockUpdateTag = vi.mocked(updateTag);
const mockApply = vi.mocked(applyChanges);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

/** DeckCard row shaped like the `categoryLinks` select the actions issue. */
function cardRow(
  id: string,
  zone: Zone,
  categories: string[],
  deckId = DECK_ID,
) {
  return {
    id,
    deckId,
    zone,
    categoryLinks: categories.map((name) => ({ deckCategory: { name } })),
  };
}

/** Membership rows for the bulk `deckCard.findMany` member loads. */
function memberRow(id: string, categories: string[]) {
  return {
    id,
    categoryLinks: categories.map((name) => ({ deckCategory: { name } })),
  };
}

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
  // Interactive transactions run their callback against a tx client backed by
  // the same mocks; array form (reorderCategories) awaits the batched calls.
  mockTransaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return arg({
        deckCard: { findMany: mockCardFindMany },
        deckCategory: {
          findMany: mockCategoryFindMany,
          findFirst: mockCategoryFindFirst,
          create: mockCategoryCreate,
          createMany: mockCategoryCreateMany,
          delete: mockCategoryDelete,
        },
      });
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
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
  it("uncategorize mode deletes only the DeckCategory row (FK cascade removes memberships)", async () => {
    const categoryId = "cat-custom";
    mockCategoryFindUnique.mockResolvedValue({ id: categoryId } as never);

    await deleteCategory(DECK_ID, "ramp");

    expect(mockCategoryDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: categoryId } }),
    );
    // No member load, no card mutation: the cascade handles memberships.
    expect(mockCardFindMany).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("throws when category does not exist", async () => {
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(deleteCategory(DECK_ID, "NonExistent")).rejects.toThrow(
      'Category "NonExistent" not found',
    );
    expect(mockCategoryDelete).not.toHaveBeenCalled();
  });

  it("throws when requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other-user" } as never);

    await expect(deleteCategory(DECK_ID, "ramp")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockCategoryDelete).not.toHaveBeenCalled();
  });

  it("deleteCards mode removes only primary members via applyChanges, then deletes the row", async () => {
    const categoryId = "cat-ramp";
    mockCategoryFindUnique.mockResolvedValue({ id: categoryId } as never);
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-primary", ["ramp", "draw"]),
      memberRow("dc-secondary", ["draw", "ramp"]),
    ] as never);

    await deleteCategory(DECK_ID, "ramp", "deleteCards");

    // Member load is MAINBOARD-scoped and membership-filtered.
    expect(mockCardFindMany).toHaveBeenCalledWith({
      where: {
        deckId: DECK_ID,
        zone: Zone.MAINBOARD,
        categoryLinks: { some: { deckCategory: { name: "ramp" } } },
      },
      select: {
        id: true,
        categoryLinks: {
          select: { deckCategory: { select: { name: true } } },
          orderBy: { position: "asc" },
        },
      },
    });

    // Only the card whose PRIMARY membership is "ramp" is removed.
    expect(mockApply).toHaveBeenCalledTimes(1);
    const [deckId, userId, changes] = mockApply.mock.calls[0]!;
    expect(deckId).toBe(DECK_ID);
    expect(userId).toBe(USER_ID);
    expect(changes).toEqual<PlannedChange[]>([
      { op: "remove", deckCardId: "dc-primary" },
    ]);

    expect(mockCategoryDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: categoryId } }),
    );
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("deleteCards mode skips applyChanges when no card has the category as primary", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-secondary", ["draw", "ramp"]),
    ] as never);

    await deleteCategory(DECK_ID, "ramp", "deleteCards");

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockCategoryDelete).toHaveBeenCalled();
  });

  it("deleteCards mode runs removals and the registry delete in one transaction", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-primary", ["ramp"]),
    ] as never);

    await deleteCategory(DECK_ID, "ramp", "deleteCards");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const [, , , opts] = mockApply.mock.calls[0]!;
    expect(opts).toHaveProperty("tx");
  });

  it("deleteCards mode propagates a registry-delete failure so removals roll back with it", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-primary", ["ramp"]),
    ] as never);
    mockCategoryDelete.mockRejectedValue(new Error("registry delete failed"));

    await expect(
      deleteCategory(DECK_ID, "ramp", "deleteCards"),
    ).rejects.toThrow("registry delete failed");
    // The card removals ran inside the same transaction, so a real client
    // rolls them back when the delete fails.
    const [, , , opts] = mockApply.mock.calls[0]!;
    expect(opts).toHaveProperty("tx");
  });

  it("rejects an invalid mode value", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-1" } as never);

    await expect(
      deleteCategory(DECK_ID, "ramp", "nuke" as never),
    ).rejects.toThrow();
    expect(mockCategoryDelete).not.toHaveBeenCalled();
  });
});

describe("renameCategory", () => {
  it("renames only the DeckCategory row (memberships follow the id), new name lowercased", async () => {
    mockCategoryFindUnique
      .mockResolvedValueOnce({ id: "cat-ramp" } as never) // old exists
      .mockResolvedValueOnce(null as never); // no conflict

    await renameCategory(DECK_ID, "ramp", "Acceleration");

    expect(mockCategoryUpdate).toHaveBeenCalledWith({
      where: { id: "cat-ramp" },
      data: { name: "acceleration" },
    });
    // No DeckCard writes: memberships reference DeckCategory.id.
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("is a no-op when new name equals old name (after lowercasing)", async () => {
    await renameCategory(DECK_ID, "ramp", "Ramp");
    // No DB write: the body returns early.
    expect(mockCategoryUpdate).not.toHaveBeenCalled();
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
  it("clears all memberships when moving out of MAINBOARD", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      zone: Zone.MAINBOARD,
    } as never);

    await moveCardZone(DECK_ID, "dc-1", Zone.SIDEBOARD);

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.SIDEBOARD,
      categories: [],
    });
  });

  it("moves back into MAINBOARD uncategorized (no membership snap-back)", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      zone: Zone.SIDEBOARD,
    } as never);

    await moveCardZone(DECK_ID, "dc-1", Zone.MAINBOARD);

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      categories: [],
    });
  });

  it("is a no-op when the card is already in the target zone", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      zone: Zone.MAINBOARD,
    } as never);

    await moveCardZone(DECK_ID, "dc-1", Zone.MAINBOARD);

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when the deck card does not belong to this deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: "other-deck",
      zone: Zone.MAINBOARD,
    } as never);

    await expect(moveCardZone(DECK_ID, "dc-1", Zone.SIDEBOARD)).rejects.toThrow(
      "Card not found or unauthorized",
    );
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("setCardCategories", () => {
  it("replaces memberships wholesale with the normalized ordered list", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["ramp"]) as never,
    );
    mockCategoryFindMany.mockResolvedValue([
      { name: "removal" },
      { name: "draw" },
    ] as never);

    await setCardCategories(DECK_ID, "dc-1", ["Removal", " Draw "]);

    expect(mockCategoryFindMany).toHaveBeenCalledWith({
      where: { deckId: DECK_ID, name: { in: ["removal", "draw"] } },
      select: { name: true },
    });
    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      categories: ["removal", "draw"],
    });
  });

  it("dedupes repeats and drops empty names while preserving order", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, []) as never,
    );
    mockCategoryFindMany.mockResolvedValue([
      { name: "ramp" },
      { name: "draw" },
    ] as never);

    await setCardCategories(DECK_ID, "dc-1", ["Ramp", "ramp", "  ", "Draw"]);

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      categories: ["ramp", "draw"],
    });
  });

  it("uncategorizes with an empty array (skips the registry lookup)", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["ramp"]) as never,
    );

    await setCardCategories(DECK_ID, "dc-1", []);

    expect(mockCategoryFindMany).not.toHaveBeenCalled();
    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      categories: [],
    });
  });

  it("rejects calls on non-MAINBOARD cards", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.SIDEBOARD, []) as never,
    );

    await expect(
      setCardCategories(DECK_ID, "dc-1", ["ramp"]),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("throws when a category is not in the deck registry", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, []) as never,
    );
    mockCategoryFindMany.mockResolvedValue([{ name: "ramp" }] as never);

    await expect(
      setCardCategories(DECK_ID, "dc-1", ["Ramp", "Ghost"]),
    ).rejects.toThrow('Category "ghost" not found in deck');
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("is a no-op when the card already has exactly these memberships in order", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["ramp", "draw"]) as never,
    );
    mockCategoryFindMany.mockResolvedValue([
      { name: "ramp" },
      { name: "draw" },
    ] as never);

    await setCardCategories(DECK_ID, "dc-1", ["Ramp", "Draw"]);

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("emits a move when only the order (primary) changes", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["ramp", "draw"]) as never,
    );
    mockCategoryFindMany.mockResolvedValue([
      { name: "ramp" },
      { name: "draw" },
    ] as never);

    await setCardCategories(DECK_ID, "dc-1", ["Draw", "Ramp"]);

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      categories: ["draw", "ramp"],
    });
  });

  it("throws when the deck card belongs to a different deck", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, [], "other-deck") as never,
    );

    await expect(
      setCardCategories(DECK_ID, "dc-1", ["ramp"]),
    ).rejects.toThrow("Card not found or unauthorized");
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("moveCardTo", () => {
  it("promotes the target category to primary and preserves other memberships", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["draw", "ramp"]) as never,
    );
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
      categories: ["ramp", "draw"],
    });
  });

  it("moves into MAINBOARD with the requested subcategory (lowercased)", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.SIDEBOARD, []) as never,
    );
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, "Ramp");

    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      categories: ["ramp"],
    });
  });

  it("clears every membership when dropped on the Uncategorized bucket", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["ramp", "draw"]) as never,
    );

    await moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, null);

    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.MAINBOARD,
      categories: [],
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
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.SIDEBOARD, []) as never,
    );
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(
      moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, "Ghost"),
    ).rejects.toThrow('Category "ghost" not found in deck');
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("is a no-op when the card is already in the target zone with the target primary", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["ramp", "draw"]) as never,
    );
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, "Ramp");

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when the deck card belongs to a different deck", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, [], "other-deck") as never,
    );

    await expect(
      moveCardTo(DECK_ID, "dc-1", Zone.MAINBOARD, null),
    ).rejects.toThrow("Card not found or unauthorized");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("moves a MAINBOARD card to a non-MAINBOARD zone clearing memberships (skips category-existence check)", async () => {
    mockCardFindUnique.mockResolvedValue(
      cardRow("dc-1", Zone.MAINBOARD, ["ramp"]) as never,
    );

    await moveCardTo(DECK_ID, "dc-1", Zone.SIDEBOARD, null);

    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    expect(moveChange()).toEqual<PlannedChange>({
      op: "move",
      deckCardId: "dc-1",
      zone: Zone.SIDEBOARD,
      categories: [],
    });
  });
});

describe("moveCategoryCards", () => {
  it("moves primary members to the target category, swapping primary and keeping secondaries", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-removal" } as never);
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-1", ["ramp"]),
      memberRow("dc-2", ["ramp", "draw"]),
      memberRow("dc-3", ["draw", "ramp"]), // secondary member: untouched
    ] as never);

    await moveCategoryCards(DECK_ID, "ramp", Zone.MAINBOARD, "Removal");

    expect(mockCardFindMany).toHaveBeenCalledWith({
      where: {
        deckId: DECK_ID,
        zone: Zone.MAINBOARD,
        categoryLinks: { some: { deckCategory: { name: "ramp" } } },
      },
      select: {
        id: true,
        categoryLinks: {
          select: { deckCategory: { select: { name: true } } },
          orderBy: { position: "asc" },
        },
      },
    });
    expect(mockApply).toHaveBeenCalledTimes(1);
    const [, , changes] = mockApply.mock.calls[0]!;
    expect(changes).toEqual<PlannedChange[]>([
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        categories: ["removal"],
      },
      {
        op: "move",
        deckCardId: "dc-2",
        zone: Zone.MAINBOARD,
        categories: ["removal", "draw"],
      },
    ]);
  });

  it("moves cards to Uncategorized (clears memberships, stays MAINBOARD)", async () => {
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-1", ["ramp", "draw"]),
    ] as never);

    await moveCategoryCards(DECK_ID, "ramp", Zone.MAINBOARD, null);

    // No category lookup needed when target is Uncategorized.
    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    const [, , changes] = mockApply.mock.calls[0]!;
    expect(changes).toEqual<PlannedChange[]>([
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: [] },
    ]);
  });

  it("clears all memberships when moving to a non-mainboard zone", async () => {
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-1", ["ramp", "draw"]),
    ] as never);

    await moveCategoryCards(DECK_ID, "ramp", Zone.SIDEBOARD, null);

    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    const [, , changes] = mockApply.mock.calls[0]!;
    expect(changes).toEqual<PlannedChange[]>([
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, categories: [] },
    ]);
  });

  it("rejects a non-mainboard zone paired with a non-null target category", async () => {
    await expect(
      moveCategoryCards(DECK_ID, "ramp", Zone.SIDEBOARD, "Removal"),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockCardFindMany).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("throws when the target category does not exist in the deck", async () => {
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(
      moveCategoryCards(DECK_ID, "ramp", Zone.MAINBOARD, "Ghost"),
    ).rejects.toThrow('Category "ghost" not found in deck');
    expect(mockCardFindMany).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("is a no-op when the source category is empty", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-removal" } as never);
    mockCardFindMany.mockResolvedValue([] as never);

    await moveCategoryCards(DECK_ID, "ramp", Zone.MAINBOARD, "Removal");

    expect(mockApply).not.toHaveBeenCalled();
  });

  it("is a no-op when every member is only a secondary of the source category", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-removal" } as never);
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-1", ["draw", "ramp"]),
    ] as never);

    await moveCategoryCards(DECK_ID, "ramp", Zone.MAINBOARD, "Removal");

    expect(mockApply).not.toHaveBeenCalled();
  });

  it("is a no-op when destination zone+category equals the source", async () => {
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);
    mockCardFindMany.mockResolvedValue([
      memberRow("dc-1", ["ramp"]),
    ] as never);

    await moveCategoryCards(DECK_ID, "ramp", Zone.MAINBOARD, "Ramp");

    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("autogenerateCategories", () => {
  function mainboardRow(
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

  type MoveOp = Extract<PlannedChange, { op: "move" }>;

  function appliedMoves(): MoveOp[] {
    expect(mockApply).toHaveBeenCalledTimes(1);
    const [, , changes] = mockApply.mock.calls[0]!;
    return changes as MoveOp[];
  }

  it("byType: groups every mainboard card by mainType, creates categories, and bulk-assigns them via move ops", async () => {
    mockCardFindMany.mockResolvedValue([
      mainboardRow("dc-1", { mainType: "Creature" }),
      mainboardRow("dc-2", { mainType: "Creature" }),
      mainboardRow("dc-3", { mainType: "Instant" }),
      mainboardRow("dc-4", { mainType: "Land" }),
    ] as never);
    mockCategoryFindMany.mockResolvedValue([] as never);
    mockCategoryCreateMany.mockResolvedValue({ count: 3 } as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId: DECK_ID, zone: Zone.MAINBOARD },
      }),
    );
    expect(mockCategoryCreateMany).toHaveBeenCalledTimes(1);
    const [createManyArg] = mockCategoryCreateMany.mock.calls[0]!;
    const createdNames = (createManyArg as { data: { name: string }[] }).data
      .map((d) => d.name);
    expect([...createdNames].sort()).toEqual(["creatures", "instants", "lands"]);

    const moves = appliedMoves();
    expect(moves).toHaveLength(4);
    for (const m of moves) {
      expect(m.op).toBe("move");
      expect(m.zone).toBe(Zone.MAINBOARD);
      expect(m.categories).toHaveLength(1);
    }
    const creatureIds = moves
      .filter((m) => m.categories[0] === "creatures")
      .map((m) => m.deckCardId);
    expect(creatureIds.sort()).toEqual(["dc-1", "dc-2"]);

    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("byType: overwrites existing memberships so switching presets reorganizes the deck", async () => {
    mockCardFindMany.mockResolvedValue([
      mainboardRow("dc-1", { mainType: "Creature" }),
    ] as never);
    mockCategoryFindMany.mockResolvedValue([
      { name: "creatures", sortOrder: 0 },
    ] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(appliedMoves()).toEqual<PlannedChange[]>([
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        categories: ["creatures"],
      },
    ]);
  });

  it("byType: skips cards with exotic mainType (classifier returns null)", async () => {
    mockCardFindMany.mockResolvedValue([
      mainboardRow("dc-1", { mainType: "Conspiracy" }),
    ] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryCreateMany).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("byType: reuses an existing DeckCategory row instead of creating a duplicate", async () => {
    mockCardFindMany.mockResolvedValue([
      mainboardRow("dc-1", { mainType: "Creature" }),
    ] as never);
    mockCategoryFindMany.mockResolvedValue([
      { name: "creatures", sortOrder: 0 },
    ] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryCreateMany).not.toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it("byType: assigns sortOrder = max+1 when creating a new category alongside existing ones", async () => {
    mockCardFindMany.mockResolvedValue([
      mainboardRow("dc-1", { mainType: "Creature" }),
    ] as never);
    mockCategoryFindMany.mockResolvedValue([
      { name: "other", sortOrder: 4 },
    ] as never);
    mockCategoryCreateMany.mockResolvedValue({ count: 1 } as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            deckId: DECK_ID,
            name: "creatures",
            sortOrder: 5,
          }),
        ],
      }),
    );
  });

  it("commanderTemplate: routes by oracle-text heuristic (Lands / Ramp / Removal / Card advantage / Gameplan)", async () => {
    mockCardFindMany.mockResolvedValue([
      mainboardRow("dc-land", { mainType: "Land" }),
      mainboardRow("dc-ramp", {
        mainType: "Artifact",
        oracleText: "Tap: Add {C}{C}.",
      }),
      mainboardRow("dc-wipe", {
        mainType: "Sorcery",
        oracleText: "Destroy all creatures.",
      }),
      mainboardRow("dc-removal", {
        mainType: "Instant",
        oracleText: "Destroy target creature.",
      }),
      mainboardRow("dc-draw", {
        mainType: "Instant",
        oracleText: "Draw two cards.",
      }),
      mainboardRow("dc-misc", {
        mainType: "Creature",
        oracleText: "Flying.",
      }),
    ] as never);
    mockCategoryFindMany.mockResolvedValue([] as never);
    mockCategoryCreateMany.mockResolvedValue({ count: 6 } as never);

    await autogenerateCategories(DECK_ID, "commanderTemplate");

    const byCategory = new Map(
      appliedMoves().map((m) => [m.categories[0], m.deckCardId]),
    );
    expect(byCategory.get("lands")).toBe("dc-land");
    expect(byCategory.get("ramp")).toBe("dc-ramp");
    expect(byCategory.get("boardwipes")).toBe("dc-wipe");
    expect(byCategory.get("removal")).toBe("dc-removal");
    expect(byCategory.get("card advantage")).toBe("dc-draw");
    expect(byCategory.get("gameplan")).toBe("dc-misc");
  });

  it("returns early without writes when there are no mainboard cards", async () => {
    mockCardFindMany.mockResolvedValue([] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryCreateMany).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("returns early without category writes when every card classifies to null", async () => {
    mockCardFindMany.mockResolvedValue([
      mainboardRow("dc-1", { mainType: "Conspiracy" }),
      mainboardRow("dc-2", { mainType: "Dungeon" }),
    ] as never);

    await autogenerateCategories(DECK_ID, "byType");

    expect(mockCategoryCreateMany).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("throws when the requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other-user" } as never);

    await expect(autogenerateCategories(DECK_ID, "byType")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockCardFindMany).not.toHaveBeenCalled();
  });
});
