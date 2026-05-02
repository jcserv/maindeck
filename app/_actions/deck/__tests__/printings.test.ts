import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---------------------------------------------------------------

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
    deckCard: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    printing: {
      findUnique: vi.fn(),
    },
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { updateCardPrinting } from "../printings";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckCardFindUnique = vi.mocked(prisma.deckCard.findUnique);
const mockDeckCardUpdate = vi.mocked(prisma.deckCard.update);
const mockPrintingFindUnique = vi.mocked(prisma.printing.findUnique);
const mockUpdateTag = vi.mocked(updateTag);

const DECK_ID = "deck-1";
const USER_ID = "user-1";
const DECK_CARD_ID = "dc-1";
const PRINTING_ID = 42;
const CARD_ID = 7;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "test@test.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
  mockDeckCardFindUnique.mockResolvedValue({
    deckId: DECK_ID,
    cardId: CARD_ID,
  } as never);
  mockPrintingFindUnique.mockResolvedValue({
    cardId: CARD_ID,
    finishes: ["nonfoil", "foil"],
  } as never);
  mockDeckCardUpdate.mockResolvedValue({} as never);
});

// -------------------------------------------------------------------------
// updateCardPrinting — happy paths
// -------------------------------------------------------------------------

describe("updateCardPrinting", () => {
  it("updates printingId and isFoil on the DeckCard row", async () => {
    await updateCardPrinting(DECK_ID, DECK_CARD_ID, PRINTING_ID, false);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: DECK_CARD_ID },
      data: { printingId: PRINTING_ID, isFoil: false },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("allows foil when printing finishes includes 'foil'", async () => {
    await updateCardPrinting(DECK_ID, DECK_CARD_ID, PRINTING_ID, true);

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: DECK_CARD_ID },
      data: { printingId: PRINTING_ID, isFoil: true },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("clears printing selection when printingId is null", async () => {
    await updateCardPrinting(DECK_ID, DECK_CARD_ID, null, false);

    // No printing lookup should happen for null printingId
    expect(mockPrintingFindUnique).not.toHaveBeenCalled();
    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: DECK_CARD_ID },
      data: { printingId: null, isFoil: false },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  // -------------------------------------------------------------------------
  // Validation failures
  // -------------------------------------------------------------------------

  it("throws when printing.cardId does not match deckCard.cardId", async () => {
    mockPrintingFindUnique.mockResolvedValue({
      cardId: 999, // different card
      finishes: ["nonfoil", "foil"],
    } as never);

    await expect(
      updateCardPrinting(DECK_ID, DECK_CARD_ID, PRINTING_ID, false),
    ).rejects.toThrow("Printing does not belong to this card");

    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });

  it("throws when isFoil=true and printing.finishes does not include 'foil'", async () => {
    mockPrintingFindUnique.mockResolvedValue({
      cardId: CARD_ID,
      finishes: ["nonfoil"],
    } as never);

    await expect(
      updateCardPrinting(DECK_ID, DECK_CARD_ID, PRINTING_ID, true),
    ).rejects.toThrow("This printing is not available in foil");

    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });

  it("throws when requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other-user" } as never);

    await expect(
      updateCardPrinting(DECK_ID, DECK_CARD_ID, PRINTING_ID, false),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });

  it("throws when deckCard does not belong to this deck", async () => {
    mockDeckCardFindUnique.mockResolvedValue({
      deckId: "other-deck",
      cardId: CARD_ID,
    } as never);

    await expect(
      updateCardPrinting(DECK_ID, DECK_CARD_ID, PRINTING_ID, false),
    ).rejects.toThrow("Not found or unauthorized");

    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });

  it("throws when printing is not found", async () => {
    mockPrintingFindUnique.mockResolvedValue(null as never);

    await expect(
      updateCardPrinting(DECK_ID, DECK_CARD_ID, PRINTING_ID, false),
    ).rejects.toThrow("Printing not found");

    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });
});
