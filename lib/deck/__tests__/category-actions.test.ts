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
import {
  createCategory,
  deleteCategory,
  moveCardSubcategory,
  moveCardTo,
  moveCardZone,
  renameCategory,
  reorderCategories,
} from "../category-actions";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockCategoryFindFirst = vi.mocked(prisma.deckCategory.findFirst);
const mockCategoryFindUnique = vi.mocked(prisma.deckCategory.findUnique);
const mockCategoryCreate = vi.mocked(prisma.deckCategory.create);
const mockCategoryDelete = vi.mocked(prisma.deckCategory.delete);
const mockCategoryUpdate = vi.mocked(prisma.deckCategory.update);
const mockCardFindUnique = vi.mocked(prisma.deckCard.findUnique);
const mockCardUpdate = vi.mocked(prisma.deckCard.update);
const mockCardUpdateMany = vi.mocked(prisma.deckCard.updateMany);
const mockCardDelete = vi.mocked(prisma.deckCard.delete);
const mockCardDeleteMany = vi.mocked(prisma.deckCard.deleteMany);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockUpdateTag = vi.mocked(updateTag);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "test@test.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
});

describe("createCategory", () => {
  it("creates a new Mainboard subcategory and returns id/name/sortOrder", async () => {
    mockCategoryFindFirst.mockResolvedValue({ sortOrder: 2 } as never);
    mockCategoryCreate.mockResolvedValue({
      id: "cat-1",
      name: "Ramp",
      sortOrder: 3,
    } as never);

    const result = await createCategory(DECK_ID, "Ramp");

    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deckId: DECK_ID,
          name: "Ramp",
          sortOrder: 3,
        }),
      }),
    );
    expect(result).toEqual({ id: "cat-1", name: "Ramp", sortOrder: 3 });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("trims name whitespace", async () => {
    mockCategoryFindFirst.mockResolvedValue(null);
    mockCategoryCreate.mockResolvedValue({
      id: "cat-2",
      name: "Win-cons",
      sortOrder: 0,
    } as never);

    await createCategory(DECK_ID, "  Win-cons  ");

    expect(mockCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Win-cons" }),
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
  it("renames the subcategory row and all DeckCard rows (any zone) referencing it", async () => {
    mockCategoryFindUnique
      .mockResolvedValueOnce({ id: "cat-ramp" } as never) // old exists
      .mockResolvedValueOnce(null as never); // no conflict

    mockTransaction.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
    });

    await renameCategory(DECK_ID, "Ramp", "Acceleration");

    expect(mockCategoryUpdate).toHaveBeenCalledWith({
      where: { id: "cat-ramp" },
      data: { name: "Acceleration" },
    });
    expect(mockCardUpdateMany).toHaveBeenCalledWith({
      where: { deckId: DECK_ID, category: "Ramp" },
      data: { category: "Acceleration" },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("is a no-op when new name equals old name", async () => {
    await renameCategory(DECK_ID, "Ramp", "Ramp");
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when new name is empty", async () => {
    await expect(renameCategory(DECK_ID, "Ramp", "   ")).rejects.toThrow(
      "Category name cannot be empty",
    );
  });

  it("throws when the target name already exists", async () => {
    mockCategoryFindUnique
      .mockResolvedValueOnce({ id: "cat-ramp" } as never)
      .mockResolvedValueOnce({ id: "cat-existing" } as never);

    await expect(
      renameCategory(DECK_ID, "Ramp", "Removal"),
    ).rejects.toThrow('Category "Removal" already exists');
  });

  it("throws when the source category does not exist", async () => {
    mockCategoryFindUnique.mockResolvedValueOnce(null as never);

    await expect(renameCategory(DECK_ID, "Missing", "New")).rejects.toThrow(
      'Category "Missing" not found',
    );
  });
});

describe("reorderCategories", () => {
  it("updates sortOrder for each category in order", async () => {
    const categories = [
      { id: "cat-1", name: "Ramp" },
      { id: "cat-2", name: "Removal" },
      { id: "cat-3", name: "Win-cons" },
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
      { id: "cat-1", name: "Ramp" },
    ] as never);

    await expect(
      reorderCategories(DECK_ID, ["Ramp", "Ghost"]),
    ).rejects.toThrow('Category "Ghost" not found in deck');
  });
});

describe("moveCardZone", () => {
  it("changes zone and preserves category string for non-mainboard targets", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 2,
      zone: "MAINBOARD",
      category: "Ramp",
    } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardZone(DECK_ID, "dc-1", "SIDEBOARD");

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dc-1" },
        data: { zone: "SIDEBOARD", category: "Ramp" },
      }),
    );
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("falls back to category=null when returning to MAINBOARD with a stale subcategory", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "SIDEBOARD",
      category: "DeletedRamp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue(null as never); // subcategory no longer exists

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardZone(DECK_ID, "dc-1", "MAINBOARD");

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dc-1" },
        data: { zone: "MAINBOARD", category: null },
      }),
    );
  });

  it("snaps back to original subcategory on Mainboard return when subcategory still exists", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "SIDEBOARD",
      category: "Ramp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardZone(DECK_ID, "dc-1", "MAINBOARD");

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { zone: "MAINBOARD", category: "Ramp" },
      }),
    );
  });

  it("merges quantity when target row already exists (zone+category collision)", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 3,
      zone: "MAINBOARD",
      category: null,
    } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ id: "dc-side", quantity: 1 }),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardZone(DECK_ID, "dc-1", "SIDEBOARD");

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dc-side" },
        data: { quantity: { increment: 3 } },
      }),
    );
    expect(mockCardDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dc-1" } }),
    );
  });

  it("is a no-op when the card is already in the target zone", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: null,
    } as never);

    await moveCardZone(DECK_ID, "dc-1", "MAINBOARD");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when the deck card does not belong to this deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: "other-deck",
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: null,
    } as never);

    await expect(moveCardZone(DECK_ID, "dc-1", "SIDEBOARD")).rejects.toThrow(
      "Card not found or unauthorized",
    );
  });
});

describe("moveCardSubcategory", () => {
  it("changes subcategory on a MAINBOARD card", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 2,
      zone: "MAINBOARD",
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardSubcategory(DECK_ID, "dc-1", "Ramp");

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { zone: "MAINBOARD", category: "Ramp" },
      }),
    );
  });

  it("allows passing null to uncategorize", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: "Ramp",
    } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardSubcategory(DECK_ID, "dc-1", null);

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { zone: "MAINBOARD", category: null },
      }),
    );
  });

  it("rejects calls on non-MAINBOARD cards", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "SIDEBOARD",
      category: null,
    } as never);

    await expect(
      moveCardSubcategory(DECK_ID, "dc-1", "Ramp"),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
  });

  it("throws when target subcategory does not exist in the deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(
      moveCardSubcategory(DECK_ID, "dc-1", "Ghost"),
    ).rejects.toThrow('Category "Ghost" not found in deck');
  });

  it("is a no-op when card already has the target subcategory", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: "Ramp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardSubcategory(DECK_ID, "dc-1", "Ramp");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throws when the deck card belongs to a different deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: "other-deck",
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: null,
    } as never);

    await expect(
      moveCardSubcategory(DECK_ID, "dc-1", "Ramp"),
    ).rejects.toThrow("Card not found or unauthorized");
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("moveCardTo", () => {
  it("moves a card to MAINBOARD with an existing subcategory", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "SIDEBOARD",
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardTo(DECK_ID, "dc-1", "MAINBOARD", "Ramp");

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dc-1" },
        data: { zone: "MAINBOARD", category: "Ramp" },
      }),
    );
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("rejects a non-null category on a non-MAINBOARD zone", async () => {
    await expect(
      moveCardTo(DECK_ID, "dc-1", "SIDEBOARD", "Ramp"),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockCardFindUnique).not.toHaveBeenCalled();
  });

  it("throws when the target subcategory does not exist", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "SIDEBOARD",
      category: null,
    } as never);
    mockCategoryFindUnique.mockResolvedValue(null as never);

    await expect(
      moveCardTo(DECK_ID, "dc-1", "MAINBOARD", "Ghost"),
    ).rejects.toThrow('Category "Ghost" not found in deck');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("is a no-op when card is already in the target zone and category", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: "Ramp",
    } as never);
    mockCategoryFindUnique.mockResolvedValue({ id: "cat-ramp" } as never);

    await moveCardTo(DECK_ID, "dc-1", "MAINBOARD", "Ramp");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("merges quantity when a target (cardId, zone, category) row already exists", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: DECK_ID,
      cardId: 42,
      quantity: 2,
      zone: "MAINBOARD",
      category: null,
    } as never);

    mockTransaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        const tx = {
          deckCard: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ id: "dc-target", quantity: 1 }),
            update: mockCardUpdate,
            delete: mockCardDelete,
          },
        };
        return fn(tx);
      }
    });

    await moveCardTo(DECK_ID, "dc-1", "SIDEBOARD", null);

    expect(mockCardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dc-target" },
        data: { quantity: { increment: 2 } },
      }),
    );
    expect(mockCardDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dc-1" } }),
    );
  });

  it("throws when the deck card belongs to a different deck", async () => {
    mockCardFindUnique.mockResolvedValue({
      id: "dc-1",
      deckId: "other-deck",
      cardId: 42,
      quantity: 1,
      zone: "MAINBOARD",
      category: null,
    } as never);

    await expect(
      moveCardTo(DECK_ID, "dc-1", "MAINBOARD", null),
    ).rejects.toThrow("Card not found or unauthorized");
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
