import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    savedDeck: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { saveDeck, unsaveDeck } from "../saved-decks";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockSavedCreateMany = vi.mocked(prisma.savedDeck.createMany);
const mockSavedDeleteMany = vi.mocked(prisma.savedDeck.deleteMany);
const mockUpdateTag = vi.mocked(updateTag);

const VIEWER = "viewer-1";
const OWNER = "owner-1";
const DECK_ID = "deck-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: VIEWER, email: "v@test.com" } as never);
});

describe("saveDeck", () => {
  it("inserts the row with skipDuplicates and bumps the saved-decks tag", async () => {
    mockDeckFindUnique.mockResolvedValue({
      userId: OWNER,
      visibility: "PUBLIC",
    } as never);
    mockSavedCreateMany.mockResolvedValue({ count: 1 } as never);

    await saveDeck(DECK_ID);

    expect(mockSavedCreateMany).toHaveBeenCalledWith({
      data: [{ userId: VIEWER, deckId: DECK_ID }],
      skipDuplicates: true,
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`saved-decks:${VIEWER}`);
  });

  it("is idempotent: calling save again is a no-op via skipDuplicates", async () => {
    mockDeckFindUnique.mockResolvedValue({
      userId: OWNER,
      visibility: "PUBLIC",
    } as never);
    // Composite PK on (userId, deckId) means the second createMany returns
    // count: 0 — Prisma swallows the duplicate. The action still re-bumps
    // the tag so any racing read sees consistent state.
    mockSavedCreateMany.mockResolvedValue({ count: 0 } as never);

    await saveDeck(DECK_ID);

    expect(mockSavedCreateMany).toHaveBeenCalledWith({
      data: [{ userId: VIEWER, deckId: DECK_ID }],
      skipDuplicates: true,
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`saved-decks:${VIEWER}`);
  });

  it("rejects saving a PRIVATE deck the visitor does not own", async () => {
    mockDeckFindUnique.mockResolvedValue({
      userId: OWNER,
      visibility: "PRIVATE",
    } as never);

    await expect(saveDeck(DECK_ID)).rejects.toThrow(
      "Not authorized to save this deck",
    );
    expect(mockSavedCreateMany).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("allows the owner to save their own PRIVATE deck", async () => {
    mockSession.mockResolvedValue({ userId: OWNER, email: "o@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: OWNER,
      visibility: "PRIVATE",
    } as never);
    mockSavedCreateMany.mockResolvedValue({ count: 1 } as never);

    await saveDeck(DECK_ID);

    expect(mockSavedCreateMany).toHaveBeenCalledWith({
      data: [{ userId: OWNER, deckId: DECK_ID }],
      skipDuplicates: true,
    });
  });

  it("throws when the deck does not exist", async () => {
    mockDeckFindUnique.mockResolvedValue(null);

    await expect(saveDeck(DECK_ID)).rejects.toThrow("Deck not found");
    expect(mockSavedCreateMany).not.toHaveBeenCalled();
  });

  it("allows saving an UNLISTED deck even when not owner", async () => {
    mockDeckFindUnique.mockResolvedValue({
      userId: OWNER,
      visibility: "UNLISTED",
    } as never);
    mockSavedCreateMany.mockResolvedValue({ count: 1 } as never);

    await saveDeck(DECK_ID);

    expect(mockSavedCreateMany).toHaveBeenCalled();
  });
});

describe("unsaveDeck", () => {
  it("scopes deleteMany to the visitor and bumps the tag", async () => {
    mockSavedDeleteMany.mockResolvedValue({ count: 1 } as never);

    await unsaveDeck(DECK_ID);

    expect(mockSavedDeleteMany).toHaveBeenCalledWith({
      where: { userId: VIEWER, deckId: DECK_ID },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`saved-decks:${VIEWER}`);
  });

  it("is a no-op when the deck wasn't saved (deleteMany matches zero rows)", async () => {
    mockSavedDeleteMany.mockResolvedValue({ count: 0 } as never);

    await expect(unsaveDeck(DECK_ID)).resolves.toBeUndefined();
    expect(mockSavedDeleteMany).toHaveBeenCalledWith({
      where: { userId: VIEWER, deckId: DECK_ID },
    });
    // The tag still bumps so the optimistic UI converges.
    expect(mockUpdateTag).toHaveBeenCalledWith(`saved-decks:${VIEWER}`);
  });
});
