import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    deckCard: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/generated/prisma/client";
import { upgradePrecon } from "../upgrade-precon";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckCreate = vi.mocked(prisma.deck.create);
const mockDeckUpdate = vi.mocked(prisma.deck.update);
const mockCardCreateMany = vi.mocked(prisma.deckCard.createMany);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const PRECON_ID = "precon-1";
const NEW_DECK_ID = "deck-new";

function makePreconLookup(
  overrides: Partial<{
    name: string;
    externalSource: string | null;
    visibility: Visibility;
  }> = {},
) {
  return {
    name: "Eldrazi Incursion",
    externalSource: "mtgjson",
    visibility: Visibility.PUBLIC,
    ...overrides,
  };
}

function makeDuplicateSource() {
  return {
    userId: "wotc-bot",
    name: "Eldrazi Incursion",
    description: "Precon",
    format: "COMMANDER",
    visibility: Visibility.PUBLIC,
    cards: [],
    categories: [],
  };
}

function setupTransaction() {
  mockTransaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") {
      const tx = {
        deck: { create: mockDeckCreate },
        deckCard: { createMany: mockCardCreateMany },
      };
      return fn(tx);
    }
  });
  mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
  mockCardCreateMany.mockResolvedValue({ count: 0 } as never);
  mockDeckUpdate.mockResolvedValue({ id: NEW_DECK_ID } as never);
  mockQueryRaw.mockResolvedValue([] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upgradePrecon", () => {
  it("forks the precon, sets owner to session user, and renames to '<name> upgrade'", async () => {
    mockSession.mockResolvedValue({
      userId: USER_ID,
      email: "u@test.com",
    } as never);
    mockDeckFindUnique
      .mockResolvedValueOnce(makePreconLookup() as never)
      .mockResolvedValueOnce(makeDuplicateSource() as never);
    setupTransaction();

    const result = await upgradePrecon(PRECON_ID);

    expect(result).toEqual({ id: NEW_DECK_ID });

    expect(mockDeckCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          forkedFromId: PRECON_ID,
          visibility: Visibility.PRIVATE,
        }),
      }),
    );

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: NEW_DECK_ID },
      data: { name: "Eldrazi Incursion upgrade" },
    });

    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${NEW_DECK_ID}`);
  });

  it("throws when the deck does not exist", async () => {
    mockSession.mockResolvedValue({
      userId: USER_ID,
      email: "u@test.com",
    } as never);
    mockDeckFindUnique.mockResolvedValueOnce(null as never);

    await expect(upgradePrecon(PRECON_ID)).rejects.toThrow("Deck not found");
    expect(mockDeckCreate).not.toHaveBeenCalled();
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("rejects non-precon decks (externalSource is not 'mtgjson')", async () => {
    mockSession.mockResolvedValue({
      userId: USER_ID,
      email: "u@test.com",
    } as never);
    mockDeckFindUnique.mockResolvedValueOnce(
      makePreconLookup({ externalSource: null }) as never,
    );

    await expect(upgradePrecon(PRECON_ID)).rejects.toThrow(
      "Deck is not an upgradable precon",
    );
    expect(mockDeckCreate).not.toHaveBeenCalled();
  });

  it("rejects precon decks that are not PUBLIC", async () => {
    mockSession.mockResolvedValue({
      userId: USER_ID,
      email: "u@test.com",
    } as never);
    mockDeckFindUnique.mockResolvedValueOnce(
      makePreconLookup({ visibility: Visibility.UNLISTED }) as never,
    );

    await expect(upgradePrecon(PRECON_ID)).rejects.toThrow(
      "Deck is not an upgradable precon",
    );
    expect(mockDeckCreate).not.toHaveBeenCalled();
  });
});
