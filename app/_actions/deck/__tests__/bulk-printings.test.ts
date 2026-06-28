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
    deck: { findUnique: vi.fn() },
    deckCard: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { bulkReselectPrintings } from "../bulk-printings";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockDeckCardUpdate = vi.mocked(prisma.deckCard.update);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockUpdateTag = vi.mocked(updateTag);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

function card(
  id: string,
  printingId: number | null,
  isFoil: boolean,
  printings: {
    id: number;
    setCode: string;
    finishes: string[];
    priceUsd: number | null;
    priceUsdFoil?: number | null;
    priceUsdEtched?: number | null;
  }[],
) {
  return {
    id,
    printingId,
    isFoil,
    card: {
      printings: printings.map((p) => ({
        priceUsdFoil: null,
        priceUsdEtched: null,
        ...p,
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
  mockDeckCardUpdate.mockImplementation((args) => args as never);
});

describe("bulkReselectPrintings", () => {
  it("repins each card to its cheapest printing", async () => {
    mockDeckCardFindMany.mockResolvedValue([
      card("dc-1", 1, false, [
        { id: 1, setCode: "dom", finishes: ["nonfoil"], priceUsd: 10 },
        { id: 2, setCode: "war", finishes: ["nonfoil"], priceUsd: 3 },
      ]),
    ] as never);

    const res = await bulkReselectPrintings(DECK_ID, "cheapest");

    expect(res).toEqual({ changed: 1, total: 1 });
    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { printingId: 2, isFoil: false },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("repins each card to its most expensive printing", async () => {
    mockDeckCardFindMany.mockResolvedValue([
      card("dc-1", 1, false, [
        { id: 1, setCode: "dom", finishes: ["nonfoil"], priceUsd: 10 },
        { id: 2, setCode: "war", finishes: ["nonfoil"], priceUsd: 30 },
      ]),
    ] as never);

    const res = await bulkReselectPrintings(DECK_ID, "most-expensive");

    expect(res).toEqual({ changed: 1, total: 1 });
    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { printingId: 2, isFoil: false },
    });
  });

  it("swaps Universes Beyond printings for in-universe ones", async () => {
    mockDeckCardFindMany.mockResolvedValue([
      card("dc-1", 1, false, [
        { id: 1, setCode: "ltr", finishes: ["nonfoil"], priceUsd: 5 },
        { id: 2, setCode: "dom", finishes: ["nonfoil"], priceUsd: 8 },
      ]),
    ] as never);

    const res = await bulkReselectPrintings(DECK_ID, "no-universes-beyond");

    expect(res).toEqual({ changed: 1, total: 1 });
    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { printingId: 2, isFoil: false },
    });
  });

  it("leaves cards unchanged when no alternative matches (no data loss)", async () => {
    mockDeckCardFindMany.mockResolvedValue([
      // Only UB printings — no-UB heuristic can't improve it.
      card("dc-1", 1, false, [
        { id: 1, setCode: "ltr", finishes: ["nonfoil"], priceUsd: 5 },
        { id: 2, setCode: "40k", finishes: ["nonfoil"], priceUsd: 9 },
      ]),
    ] as never);

    const res = await bulkReselectPrintings(DECK_ID, "no-universes-beyond");

    expect(res).toEqual({ changed: 0, total: 1 });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDeckCardUpdate).not.toHaveBeenCalled();
  });

  it("clears the foil pin when the chosen printing has no foil finish", async () => {
    mockDeckCardFindMany.mockResolvedValue([
      card("dc-1", 1, true, [
        { id: 1, setCode: "dom", finishes: ["nonfoil", "foil"], priceUsd: 10 },
        { id: 2, setCode: "war", finishes: ["nonfoil"], priceUsd: 3 },
      ]),
    ] as never);

    await bulkReselectPrintings(DECK_ID, "cheapest");

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { printingId: 2, isFoil: false },
    });
  });

  it("keeps the foil pin when the chosen printing supports foil", async () => {
    mockDeckCardFindMany.mockResolvedValue([
      card("dc-1", 1, true, [
        { id: 1, setCode: "dom", finishes: ["nonfoil", "foil"], priceUsd: 10 },
        { id: 2, setCode: "war", finishes: ["nonfoil", "foil"], priceUsd: 3 },
      ]),
    ] as never);

    await bulkReselectPrintings(DECK_ID, "cheapest");

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { printingId: 2, isFoil: true },
    });
  });

  it("rejects an unknown heuristic", async () => {
    mockDeckCardFindMany.mockResolvedValue([] as never);
    await expect(
      bulkReselectPrintings(DECK_ID, "bogus" as never),
    ).rejects.toThrow("Unknown printing heuristic");
  });

  it("throws when the requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other" } as never);
    await expect(
      bulkReselectPrintings(DECK_ID, "cheapest"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
