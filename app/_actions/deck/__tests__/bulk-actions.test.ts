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
    deck: { findUnique: vi.fn() },
    deckCategory: { findMany: vi.fn() },
    deckCard: { findMany: vi.fn() },
  },
}));

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { applyChanges } from "@/lib/deck/mutation";
import { applyBulkCardAction } from "../bulk-actions";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockApply = vi.mocked(applyChanges);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

function cardRow(id: string, zone: string, categories: string[]) {
  return {
    id,
    zone,
    categoryLinks: categories.map((name) => ({ deckCategory: { name } })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
  mockCategoryFindMany.mockResolvedValue([
    { name: "ramp" },
    { name: "draw" },
  ] as never);
});

describe("applyBulkCardAction", () => {
  it("re-plans against the deck's own rows and applies every change in one mutation", async () => {
    mockCardFindMany.mockResolvedValue([
      cardRow("a", "MAINBOARD", ["ramp"]),
      cardRow("b", "SIDEBOARD", []),
    ] as never);

    await applyBulkCardAction(
      DECK_ID,
      [{ deckCardId: "a" }, { deckCardId: "b" }],
      { kind: "setPrimaryCategory", category: "  Draw " },
    );

    expect(mockCardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId: DECK_ID, id: { in: ["a", "b"] } },
      }),
    );
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(DECK_ID, USER_ID, [
      {
        op: "move",
        deckCardId: "a",
        zone: "MAINBOARD",
        categories: ["draw", "ramp"],
      },
      { op: "move", deckCardId: "b", zone: "MAINBOARD", categories: ["draw"] },
    ]);
  });

  it("normalizes the category name before adding a membership", async () => {
    mockCardFindMany.mockResolvedValue([
      cardRow("a", "MAINBOARD", ["ramp"]),
    ] as never);

    await applyBulkCardAction(DECK_ID, [{ deckCardId: "a" }], {
      kind: "addCategory",
      category: " DRAW  ",
    });

    expect(mockApply).toHaveBeenCalledWith(DECK_ID, USER_ID, [
      {
        op: "move",
        deckCardId: "a",
        zone: "MAINBOARD",
        categories: ["ramp", "draw"],
      },
    ]);
  });

  it("skips the mutation when nothing would change", async () => {
    mockCardFindMany.mockResolvedValue([
      cardRow("a", "SIDEBOARD", []),
    ] as never);

    await applyBulkCardAction(DECK_ID, [{ deckCardId: "a" }], {
      kind: "moveZone",
      zone: "SIDEBOARD",
    });

    expect(mockApply).not.toHaveBeenCalled();
  });

  it("rejects non-owners before touching cards", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(
      applyBulkCardAction(DECK_ID, [{ deckCardId: "a" }], { kind: "remove" }),
    ).rejects.toThrow();
    expect(mockCardFindMany).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });
});
