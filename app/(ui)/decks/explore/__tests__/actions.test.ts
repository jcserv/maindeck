import { beforeEach, describe, expect, it, vi } from "vitest";
import { Format, Visibility } from "@/lib/generated/prisma/enums";

vi.mock("@/lib/deck/queries", () => ({
  getPublicDecksWithPreview: vi.fn(),
  selectDeckPreviewImages: vi.fn(() => ["/img/a.webp"]),
}));

import { getPublicDecksWithPreview } from "@/lib/deck/queries";
import { loadMorePublicDecks } from "../actions";

const mockGet = vi.mocked(getPublicDecksWithPreview);

function deck(over: Partial<Parameters<typeof mockGet>[0]> & Record<string, unknown> = {}) {
  return {
    id: "d1",
    name: "My Deck",
    format: Format.COMMANDER,
    visibility: Visibility.PUBLIC,
    cardCount: 100,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    releasedAt: null,
    cards: [],
    isOfficial: false,
    commanderName: null,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadMorePublicDecks", () => {
  it("forwards filters + pagination and serializes Date fields", async () => {
    mockGet.mockResolvedValue({
      decks: [deck({ id: "d1" })],
      total: 1,
    } as never);

    const out = await loadMorePublicDecks(
      { format: Format.COMMANDER, sort: "updated" },
      1,
      20,
    );

    expect(mockGet).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      format: Format.COMMANDER,
      sort: "updated",
    });
    expect(out.decks[0]!.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(out.decks[0]!.previewImages).toEqual(["/img/a.webp"]);
    expect(out.hasMore).toBe(false);
  });

  it("forwards every optional filter when all are defined", async () => {
    mockGet.mockResolvedValue({ decks: [], total: 0 } as never);
    await loadMorePublicDecks(
      {
        q: "dragon",
        format: Format.COMMANDER,
        colors: ["W", "U"],
        commander: "Niv-Mizzet",
        source: "official",
        sort: "created",
      },
      1,
      20,
    );
    expect(mockGet).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      q: "dragon",
      format: Format.COMMANDER,
      colors: ["W", "U"],
      commander: "Niv-Mizzet",
      source: "official",
      sort: "created",
    });
  });

  it("hasMore=true when loaded < total at the page boundary", async () => {
    mockGet.mockResolvedValue({
      decks: [deck({ id: "d1" }), deck({ id: "d2" })],
      total: 5,
    } as never);
    const out = await loadMorePublicDecks({}, 1, 2);
    expect(out.hasMore).toBe(true);
  });

  it("hasMore=false when loaded >= total at the final page", async () => {
    mockGet.mockResolvedValue({
      decks: [deck({ id: "d1" })],
      total: 3,
    } as never);
    // page 2, pageSize 2 → loaded = 1*2 + 1 = 3, total = 3 → hasMore false
    const out = await loadMorePublicDecks({}, 2, 2);
    expect(out.hasMore).toBe(false);
  });

  it("serializes a Date releasedAt to ISO string", async () => {
    mockGet.mockResolvedValue({
      decks: [
        deck({ releasedAt: new Date("2025-12-25T00:00:00Z") }),
      ],
      total: 1,
    } as never);
    const out = await loadMorePublicDecks({}, 1, 10);
    expect(out.decks[0]!.releasedAt).toBe("2025-12-25T00:00:00.000Z");
  });

  it("preserves an already-stringified releasedAt value", async () => {
    mockGet.mockResolvedValue({
      decks: [deck({ releasedAt: "2025-11-01" })],
      total: 1,
    } as never);
    const out = await loadMorePublicDecks({}, 1, 10);
    expect(out.decks[0]!.releasedAt).toBe("2025-11-01");
  });

  it("preserves an already-stringified updatedAt value", async () => {
    mockGet.mockResolvedValue({
      decks: [deck({ updatedAt: "2026-02-02" as unknown as Date })],
      total: 1,
    } as never);
    const out = await loadMorePublicDecks({}, 1, 10);
    expect(out.decks[0]!.updatedAt).toBe("2026-02-02");
  });

  it("returns null releasedAt when missing", async () => {
    mockGet.mockResolvedValue({
      decks: [deck({ releasedAt: null })],
      total: 1,
    } as never);
    const out = await loadMorePublicDecks({}, 1, 10);
    expect(out.decks[0]!.releasedAt).toBeNull();
  });
});

describe("loadMorePublicDecks — arg validation", () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ decks: [], total: 0 } as never);
  });

  it("clamps pageSize=1e6 to 48", async () => {
    await loadMorePublicDecks({}, 1, 1e6);
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 48 }),
    );
  });

  it("clamps page=NaN to 1", async () => {
    await loadMorePublicDecks({}, NaN, 24);
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it("ignores an invalid format value without throwing", async () => {
    await expect(
      loadMorePublicDecks({ format: "BOGUS" as unknown as Format }, 1, 24),
    ).resolves.not.toThrow();
    // BOGUS is stripped; format key should be absent or undefined
    const call = mockGet.mock.calls[0]?.[0];
    expect(call?.format).toBeUndefined();
  });
});
