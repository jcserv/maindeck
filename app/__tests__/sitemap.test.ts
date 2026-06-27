import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findMany: vi.fn() },
    deckCard: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import sitemap from "../sitemap";

const mockFindMany = vi.mocked(prisma.deck.findMany);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("sitemap", () => {
  it("emits the root + decks index plus one entry per public deck", async () => {
    const userUpdated = new Date("2026-03-01T12:00:00Z");
    const preconUpdated = new Date("2026-02-01T12:00:00Z");
    mockFindMany.mockResolvedValue([
      { id: "user-deck", updatedAt: userUpdated, externalSource: null },
      {
        id: "precon-deck",
        updatedAt: preconUpdated,
        externalSource: "mtgjson",
      },
    ] as never);

    const result = await sitemap();

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      url: "https://example.test/",
      priority: 1,
    });
    expect(result[1]).toMatchObject({
      url: "https://example.test/decks",
      priority: 0.9,
    });
    // User decks get priority 0.8.
    expect(result[2]).toEqual({
      url: "https://example.test/deck/user-deck",
      lastModified: userUpdated,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    // Precons get priority 0.5.
    expect(result[3]).toEqual({
      url: "https://example.test/deck/precon-deck",
      lastModified: preconUpdated,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  });

  it("returns just the root entries when there are no public decks", async () => {
    mockFindMany.mockResolvedValue([] as never);

    const result = await sitemap();

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.url)).toEqual([
      "https://example.test/",
      "https://example.test/decks",
    ]);
  });
});
