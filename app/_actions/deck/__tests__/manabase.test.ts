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
vi.mock("@/lib/deck/manabase/candidates", () => ({
  getBasicLandCardIds: vi.fn(),
  getBasicLandImages: vi.fn(),
  getLandCandidates: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    deckCard: { findMany: vi.fn() },
  },
}));

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Format, Zone } from "@/lib/generated/prisma/client";
import { applyChanges, type PlannedChange } from "@/lib/deck/mutation";
import {
  getBasicLandCardIds,
  getBasicLandImages,
  getLandCandidates,
} from "@/lib/deck/manabase/candidates";
import { addLandsToDeck, getLandCandidatesAction } from "../manabase";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckFindUniqueOrThrow = vi.mocked(prisma.deck.findUniqueOrThrow);
const mockCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockApply = vi.mocked(applyChanges);
const mockBasicIds = vi.mocked(getBasicLandCardIds);
const mockBasicImages = vi.mocked(getBasicLandImages);
const mockCandidates = vi.mocked(getLandCandidates);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

const BASIC_IDS = { W: 11, U: 22, B: 33, R: 44, G: 55, C: 66 };

function emptyBasics() {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

function changes(): PlannedChange[] {
  expect(mockApply).toHaveBeenCalledTimes(1);
  return mockApply.mock.calls[0]![2];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
  mockApply.mockResolvedValue(undefined);
  mockBasicIds.mockResolvedValue(BASIC_IDS as never);
});

describe("addLandsToDeck", () => {
  it("adds nonbasic picks to MAINBOARD uncategorized", async () => {
    await addLandsToDeck(DECK_ID, {
      picks: [{ cardId: 101, quantity: 2 }],
      basics: emptyBasics(),
    });

    expect(changes()).toEqual<PlannedChange[]>([
      {
        op: "add",
        cardId: 101,
        quantity: 2,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
  });

  it("resolves basics by color and adds only nonzero counts", async () => {
    await addLandsToDeck(DECK_ID, {
      picks: [],
      basics: { ...emptyBasics(), U: 6, B: 3 },
    });

    expect(mockBasicIds).toHaveBeenCalledTimes(1);
    expect(changes()).toEqual<PlannedChange[]>([
      { op: "add", cardId: 22, quantity: 6, zone: Zone.MAINBOARD, category: null },
      { op: "add", cardId: 33, quantity: 3, zone: Zone.MAINBOARD, category: null },
    ]);
  });

  it("filters zero-quantity picks and basics", async () => {
    await addLandsToDeck(DECK_ID, {
      picks: [
        { cardId: 101, quantity: 0 },
        { cardId: 102, quantity: 1 },
      ],
      basics: { ...emptyBasics(), U: 0, R: 4 },
    });

    expect(changes()).toEqual<PlannedChange[]>([
      { op: "add", cardId: 102, quantity: 1, zone: Zone.MAINBOARD, category: null },
      { op: "add", cardId: 44, quantity: 4, zone: Zone.MAINBOARD, category: null },
    ]);
  });

  it("does not resolve basic ids when no basics are requested", async () => {
    await addLandsToDeck(DECK_ID, {
      picks: [{ cardId: 101, quantity: 1 }],
      basics: emptyBasics(),
    });

    expect(mockBasicIds).not.toHaveBeenCalled();
  });

  it("is a no-op when nothing is selected", async () => {
    await addLandsToDeck(DECK_ID, { picks: [], basics: emptyBasics() });

    expect(mockApply).not.toHaveBeenCalled();
  });

  it("rejects negative quantities via schema", async () => {
    await expect(
      addLandsToDeck(DECK_ID, {
        picks: [{ cardId: 101, quantity: -1 }],
        basics: emptyBasics(),
      }),
    ).rejects.toThrow();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("throws when the requester does not own the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "other" } as never);

    await expect(
      addLandsToDeck(DECK_ID, { picks: [], basics: emptyBasics() }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("getLandCandidatesAction", () => {
  it("resolves the deck's color identity server-side and buckets candidates under it, scoped to the deck's format", async () => {
    const buckets = { fetch: [] } as never;
    mockCandidates.mockResolvedValue(buckets);
    const basicImages = { W: "w.png" } as never;
    mockBasicImages.mockResolvedValue(basicImages);
    mockDeckFindUniqueOrThrow.mockResolvedValue({
      format: Format.MODERN,
    } as never);
    mockCardFindMany.mockResolvedValue([
      { card: { colorIdentity: ["U", "B"] } },
      { card: { colorIdentity: ["U"] } },
      { card: { colorIdentity: [] } },
    ] as never);

    const result = await getLandCandidatesAction(DECK_ID);

    expect(mockDeckFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      select: { format: true },
    });
    expect(mockCardFindMany).toHaveBeenCalledWith({
      where: { deckId: DECK_ID, zone: { in: [Zone.MAINBOARD, Zone.COMMANDER] } },
      select: { card: { select: { colorIdentity: true } } },
    });
    expect(mockCandidates).toHaveBeenCalledWith(["U", "B"], Format.MODERN);
    expect(result).toEqual({
      colorIdentity: ["U", "B"],
      candidates: buckets,
      basicImages,
    });
  });
});
