import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));
vi.mock("../queries", () => ({
  getDeckById: vi.fn(),
}));
vi.mock("@/lib/deck/external-fetch", () => ({
  fetchExternalComparableDeck: vi.fn(),
  buildComparableDeckFromText: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { getDeckById } from "../queries";
import { fetchExternalComparableDeck, buildComparableDeckFromText } from "@/lib/deck/external-fetch";
import { canViewDeck, loadComparison, loadExternalComparison, loadTextComparison } from "../compare-queries";

const mockFetchExternal = vi.mocked(fetchExternalComparableDeck);
const mockBuildFromText = vi.mocked(buildComparableDeckFromText);

const mockGetSession = vi.mocked(getSession);
const mockGetDeckById = vi.mocked(getDeckById);

const OWNER = "user-1";
const OTHER = "user-2";

function deck(id: string, userId: string, visibility: string) {
  return { id, userId, visibility, name: id, format: "COMMANDER", cards: [] } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canViewDeck", () => {
  it("lets the owner view their own deck at any visibility", () => {
    expect(canViewDeck({ userId: OWNER, visibility: "PRIVATE" }, OWNER)).toBe(true);
  });

  it("lets anyone view PUBLIC and UNLISTED decks", () => {
    expect(canViewDeck({ userId: OTHER, visibility: "PUBLIC" }, OWNER)).toBe(true);
    expect(canViewDeck({ userId: OTHER, visibility: "UNLISTED" }, OWNER)).toBe(true);
    expect(canViewDeck({ userId: OTHER, visibility: "PUBLIC" }, undefined)).toBe(true);
  });

  it("blocks non-owners (and logged-out viewers) from PRIVATE decks", () => {
    expect(canViewDeck({ userId: OTHER, visibility: "PRIVATE" }, OWNER)).toBe(false);
    expect(canViewDeck({ userId: OTHER, visibility: "PRIVATE" }, undefined)).toBe(false);
  });
});

describe("loadComparison", () => {
  it("returns both decks when the viewer may see each", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockImplementation((async (id: string) =>
      id === "mine"
        ? deck("mine", OWNER, "PRIVATE")
        : deck("pub", OTHER, "PUBLIC")) as never);

    const { a, b, viewerId } = await loadComparison("mine", "pub");

    expect(a.id).toBe("mine");
    expect(b.id).toBe("pub");
    expect(viewerId).toBe(OWNER);
  });

  it("404s when comparing a deck against itself, without loading it", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);

    await expect(loadComparison("mine", "mine")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockGetDeckById).not.toHaveBeenCalled();
  });

  it("404s when either deck is missing (no existence probing)", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockImplementation((async (id: string) =>
      id === "mine" ? deck("mine", OWNER, "PRIVATE") : null) as never);

    await expect(loadComparison("mine", "ghost")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("404s rather than leaking a PRIVATE deck the viewer cannot see", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockImplementation((async (id: string) =>
      id === "mine"
        ? deck("mine", OWNER, "PUBLIC")
        : deck("secret", OTHER, "PRIVATE")) as never);

    await expect(loadComparison("mine", "secret")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("blocks a logged-out viewer from comparing against a PRIVATE deck", async () => {
    mockGetSession.mockResolvedValue(null);
    mockGetDeckById.mockImplementation((async (id: string) =>
      id === "pub"
        ? deck("pub", OTHER, "PUBLIC")
        : deck("secret", OWNER, "PRIVATE")) as never);

    await expect(loadComparison("pub", "secret")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("loadExternalComparison", () => {
  const externalDeck = {
    id: "https://archidekt.com/decks/123",
    name: "External Deck",
    format: "COMMANDER" as never,
    cards: [],
  };

  it("returns comparison result when deck is viewable", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockResolvedValue(deck("mine", OWNER, "PRIVATE") as never);
    mockFetchExternal.mockResolvedValue(externalDeck as never);

    const result = await loadExternalComparison("mine", "https://archidekt.com/decks/123");

    expect(result.a.id).toBe("mine");
    expect(result.b.id).toBe("https://archidekt.com/decks/123");
    expect(result.b.url).toBe("https://archidekt.com/decks/123");
  });

  it("404s when deck A is not found", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockResolvedValue(null as never);

    await expect(loadExternalComparison("missing", "https://archidekt.com/decks/123")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("404s when viewer cannot see deck A", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockResolvedValue(deck("secret", OTHER, "PRIVATE") as never);

    await expect(loadExternalComparison("secret", "https://archidekt.com/decks/123")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("loadTextComparison", () => {
  const textDeck = {
    id: "text-import",
    name: "Pasted decklist",
    format: "COMMANDER" as never,
    cards: [],
  };

  it("returns comparison result from text", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockResolvedValue(deck("mine", OWNER, "PRIVATE") as never);
    mockBuildFromText.mockResolvedValue(textDeck as never);

    const result = await loadTextComparison("mine", "1 Sol Ring");

    expect(result.a.id).toBe("mine");
    expect(result.b.id).toBe("text-import");
  });

  it("404s when deck A is not found", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockResolvedValue(null as never);

    await expect(loadTextComparison("missing", "1 Sol Ring")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("404s when viewer cannot see deck A", async () => {
    mockGetSession.mockResolvedValue({ userId: OWNER } as never);
    mockGetDeckById.mockResolvedValue(deck("secret", OTHER, "PRIVATE") as never);

    await expect(loadTextComparison("secret", "1 Sol Ring")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
