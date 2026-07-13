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
vi.mock("@/lib/db", () => {
  const deckCategory = { findMany: vi.fn(), createMany: vi.fn() };
  return {
    prisma: {
      deck: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      card: {
        findMany: vi.fn(),
      },
      printing: {
        findMany: vi.fn(),
      },
      deckCategory,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({ deckCategory }),
      ),
    },
  };
});
vi.mock("@/lib/deck/mutation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deck/mutation")>(
    "@/lib/deck/mutation",
  );
  return {
    ...actual,
    applyChanges: vi.fn(),
  };
});

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { applyChanges, InvariantViolation } from "@/lib/deck/mutation";
import { createDeckWithImport, importDeck } from "../import";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckCreate = vi.mocked(prisma.deck.create);
const mockDeckDelete = vi.mocked(prisma.deck.delete);
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);
const mockApply = vi.mocked(applyChanges);

const USER_ID = "user-1";
const DECK_ID = "deck-1";
const NEW_DECK_ID = "deck-new";

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({
    id: DECK_ID,
    userId: USER_ID,
  } as never);
  mockPrintingFindMany.mockResolvedValue([] as never);
  mockCardFindMany.mockResolvedValue([
    { id: 1, name: "Lightning Bolt" },
  ] as never);
});

describe("importDeck — applyChanges error handling", () => {
  it("converts InvariantViolation issues into warnings and reports added=0", async () => {
    mockApply.mockRejectedValueOnce(
      new InvariantViolation([
        { kind: "singleton_violation", cardName: "Sol Ring", quantity: 2 },
      ]),
    );

    const result = await importDeck(DECK_ID, "1 Lightning Bolt");

    expect(result.added).toBe(0);
    expect(result.warnings).toContain("Sol Ring: Singleton format — 2 copies in deck");
  });

  it("rethrows non-InvariantViolation errors from applyChanges", async () => {
    mockApply.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(importDeck(DECK_ID, "1 Lightning Bolt")).rejects.toThrow(
      "DB connection lost",
    );
  });
});

describe("createDeckWithImport — applyChanges error handling", () => {
  beforeEach(() => {
    mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
    mockDeckDelete.mockResolvedValue({ id: NEW_DECK_ID } as never);
  });

  it("swallows InvariantViolation so the deck still gets created", async () => {
    mockApply.mockRejectedValueOnce(
      new InvariantViolation([
        { kind: "deck_size", expected: 60, actual: 4 },
      ]),
    );

    const id = await createDeckWithImport({
      name: "Test",
      importText: "1 Lightning Bolt",
    });

    expect(id).toBe(NEW_DECK_ID);
  });

  it("rethrows non-InvariantViolation errors from applyChanges", async () => {
    mockApply.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(
      createDeckWithImport({ name: "Test", importText: "1 Lightning Bolt" }),
    ).rejects.toThrow("DB connection lost");
  });

  it("deletes the deck row when applyChanges throws a non-InvariantViolation", async () => {
    mockApply.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(
      createDeckWithImport({ name: "Test", importText: "1 Lightning Bolt" }),
    ).rejects.toThrow("DB connection lost");

    expect(mockDeckDelete).toHaveBeenCalledWith({
      where: { id: NEW_DECK_ID },
    });
  });

  it("swallows errors from the cleanup deck.delete and rethrows the original", async () => {
    mockApply.mockRejectedValueOnce(new Error("DB connection lost"));
    mockDeckDelete.mockRejectedValueOnce(new Error("delete failed"));

    await expect(
      createDeckWithImport({ name: "Test", importText: "1 Lightning Bolt" }),
    ).rejects.toThrow("DB connection lost");
  });
});
