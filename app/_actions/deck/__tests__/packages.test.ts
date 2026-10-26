import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/deck/package-queries", () => ({
  getPackagesByUser: vi.fn(async () => []),
}));
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
  return { ...actual, applyChanges: vi.fn(async () => undefined) };
});
vi.mock("@/lib/deck/category-registry", () => ({
  ensureDeckCategories: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn("tx")),
    deck: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    deckCard: { findMany: vi.fn() },
  },
}));

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { applyChanges } from "@/lib/deck/mutation";
import { ensureDeckCategories } from "@/lib/deck/category-registry";
import { getPackagesByUser } from "@/lib/deck/package-queries";
import {
  applyPackageToDeck,
  createPackage,
  listMyPackages,
} from "../packages";

const DECK_ID = "deck-1";
const PACKAGE_ID = "pkg-1";
const USER_ID = "user-1";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockApply = vi.mocked(applyChanges);
const mockEnsure = vi.mocked(ensureDeckCategories);

function packageCard(cardId: number, name: string, categories: string[]) {
  return {
    cardId,
    zone: Zone.MAINBOARD,
    quantity: 1,
    printingId: null,
    isFoil: false,
    card: { name, typeLine: "Artifact" },
    categoryLinks: categories.map((n) => ({ deckCategory: { name: n } })),
  };
}

function stubPackage(overrides: Record<string, unknown> = {}) {
  const pkg = {
    userId: USER_ID,
    kind: "PACKAGE",
    visibility: "PRIVATE",
    categories: [{ name: "ramp" }, { name: "draw" }, { name: "removal" }],
    cards: [
      packageCard(1, "Sol Ring", ["ramp"]),
      packageCard(2, "Rhystic Study", ["draw", "ramp"]),
      packageCard(3, "Swords to Plowshares", ["removal"]),
    ],
    ...overrides,
  };
  mockDeckFindUnique.mockImplementation((async (args: {
    where: { id: string };
  }) =>
    args.where.id === DECK_ID ? { userId: USER_ID } : pkg) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  vi.mocked(prisma.deck.findUniqueOrThrow).mockResolvedValue({
    format: Format.COMMANDER,
  } as never);
  vi.mocked(prisma.deckCard.findMany).mockResolvedValue([] as never);
});

describe("applyPackageToDeck", () => {
  it("registers only the categories the copied cards use, in package order", async () => {
    stubPackage();
    vi.mocked(prisma.deckCard.findMany).mockResolvedValue([
      { cardId: 3 },
    ] as never);

    const result = await applyPackageToDeck(DECK_ID, PACKAGE_ID);

    expect(result).toEqual({ added: 2, skipped: ["Swords to Plowshares"] });
    expect(mockEnsure).toHaveBeenCalledWith("tx", DECK_ID, ["ramp", "draw"]);
    expect(mockApply).toHaveBeenCalledWith(
      DECK_ID,
      USER_ID,
      expect.arrayContaining([
        expect.objectContaining({ cardId: 2, categories: ["draw", "ramp"] }),
      ]),
      { tx: "tx" },
    );
  });

  it("applies another user's non-private package", async () => {
    stubPackage({ userId: "someone-else", visibility: "UNLISTED" });

    await expect(applyPackageToDeck(DECK_ID, PACKAGE_ID)).resolves.toEqual({
      added: 3,
      skipped: [],
    });
  });

  it("counts added copies, not lines", async () => {
    stubPackage({
      categories: [],
      cards: [
        packageCard(1, "Sol Ring", []),
        {
          ...packageCard(2, "Island", []),
          quantity: 10,
          card: { name: "Island", typeLine: "Basic Land — Island" },
        },
      ],
    });

    await expect(applyPackageToDeck(DECK_ID, PACKAGE_ID)).resolves.toEqual({
      added: 11,
      skipped: [],
    });
  });

  it("404s on another user's private package", async () => {
    stubPackage({ userId: "someone-else" });

    await expect(applyPackageToDeck(DECK_ID, PACKAGE_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("404s when the id points at a regular deck", async () => {
    stubPackage({ kind: "DECK", visibility: "PUBLIC" });

    await expect(applyPackageToDeck(DECK_ID, PACKAGE_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("writes nothing when every card is already in the deck", async () => {
    stubPackage();
    vi.mocked(prisma.deckCard.findMany).mockResolvedValue([
      { cardId: 1 },
      { cardId: 2 },
      { cardId: 3 },
    ] as never);

    const result = await applyPackageToDeck(DECK_ID, PACKAGE_ID);

    expect(result.added).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("createPackage", () => {
  it("creates a private package owned by the caller", async () => {
    vi.mocked(prisma.deck.create).mockResolvedValue({ id: "new" } as never);

    await expect(createPackage("  Staples  ")).resolves.toBe("new");
    expect(prisma.deck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          name: "Staples",
          visibility: "PRIVATE",
          kind: "PACKAGE",
        }),
      }),
    );
  });

  it("rejects a blank name", async () => {
    await expect(createPackage("   ")).rejects.toThrow();
    expect(prisma.deck.create).not.toHaveBeenCalled();
  });
});

describe("listMyPackages", () => {
  it("lists only the caller's packages", async () => {
    await listMyPackages();

    expect(getPackagesByUser).toHaveBeenCalledWith(USER_ID);
  });
});
