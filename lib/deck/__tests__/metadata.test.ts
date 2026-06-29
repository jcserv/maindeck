import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOT_FOUND_METADATA,
  buildDeckJsonLd,
  buildDeckMetadata,
  deckUrl,
  getSiteUrl,
  type DeckForMetadata,
} from "../metadata";

const UPDATED_AT = new Date("2026-04-15T10:00:00.000Z");

function makeDeck(
  overrides: Partial<DeckForMetadata> = {},
): DeckForMetadata {
  return {
    id: "deck-1",
    name: "Burn",
    description: "Fast aggressive deck",
    format: "MODERN",
    visibility: "PUBLIC",
    kind: "DECK",
    updatedAt: UPDATED_AT,
    user: { username: "alice" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSiteUrl", () => {
  it("returns NEXT_PUBLIC_SITE_URL with trailing slash stripped", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test/");
    expect(getSiteUrl()).toBe("https://example.test");
  });

  it("falls back to the production hostname when env is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getSiteUrl()).toBe("https://maindeck.app");
  });

  it("falls back to the production hostname when env is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined as unknown as string);
    expect(getSiteUrl()).toBe("https://maindeck.app");
  });
});

describe("deckUrl", () => {
  it("composes canonical /deck/<id> path against the site origin", () => {
    expect(deckUrl("abc")).toBe("https://example.test/deck/abc");
  });
});

describe("buildDeckMetadata", () => {
  it("returns indexable metadata for PUBLIC decks", () => {
    const meta = buildDeckMetadata(makeDeck());
    expect(meta.title).toBe("Burn — Modern deck");
    expect(meta.description).toBe("Fast aggressive deck");
    expect(meta.alternates).toEqual({
      canonical: "https://example.test/deck/deck-1",
    });
    expect(meta.robots).toBeUndefined();
  });

  it("falls back to a generated description when description is missing", () => {
    const meta = buildDeckMetadata(makeDeck({ description: null }));
    expect(meta.description).toBe("Modern deck by alice on maindeck.");
  });

  it("falls back to a generated description when description is whitespace", () => {
    const meta = buildDeckMetadata(makeDeck({ description: "   " }));
    expect(meta.description).toBe("Modern deck by alice on maindeck.");
  });

  it("omits the author clause when no username is available", () => {
    const meta = buildDeckMetadata(
      makeDeck({ description: null, user: null }),
    );
    expect(meta.description).toBe("Modern deck on maindeck.");
  });

  it("omits the author clause when user has no username", () => {
    const meta = buildDeckMetadata(
      makeDeck({ description: null, user: { username: null } }),
    );
    expect(meta.description).toBe("Modern deck on maindeck.");
  });

  it("truncates long descriptions to 160 chars with an ellipsis", () => {
    const long = "x".repeat(200);
    const meta = buildDeckMetadata(makeDeck({ description: long }));
    expect(meta.description).toHaveLength(160);
    expect(meta.description?.endsWith("…")).toBe(true);
  });

  it("marks UNLISTED decks noindex,nofollow but still emits canonical", () => {
    const meta = buildDeckMetadata(makeDeck({ visibility: "UNLISTED" }));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toEqual({
      canonical: "https://example.test/deck/deck-1",
    });
    expect(meta.title).toBe("Burn — Modern deck");
  });

  it("marks PRIVATE decks noindex,nofollow but still emits the title for owners", () => {
    // The page-level `generateMetadata` swaps to NOT_FOUND_METADATA when the
    // visitor isn't the owner; the helper itself only sees the deck row, so
    // a PRIVATE deck still produces a real title for the owner's tab.
    const meta = buildDeckMetadata(makeDeck({ visibility: "PRIVATE" }));
    expect(meta.title).toBe("Burn — Modern deck");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toEqual({
      canonical: "https://example.test/deck/deck-1",
    });
  });

  it("marks a PUBLIC wishlist noindex,nofollow so it stays link-only", () => {
    const meta = buildDeckMetadata(
      makeDeck({ visibility: "PUBLIC", kind: "WISHLIST" }),
    );
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toEqual({
      canonical: "https://example.test/deck/deck-1",
    });
    expect(meta.title).toBe("Burn — Modern deck");
  });

  it("returns the not-found shell when the deck is null", () => {
    expect(buildDeckMetadata(null)).toBe(NOT_FOUND_METADATA);
  });

  it("exports NOT_FOUND_METADATA with noindex,nofollow", () => {
    expect(NOT_FOUND_METADATA).toEqual({
      title: "Deck not found",
      robots: { index: false, follow: false },
    });
  });
});

describe("buildDeckJsonLd", () => {
  it("emits a CreativeWork payload for PUBLIC decks", () => {
    const ld = buildDeckJsonLd(makeDeck());
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: "Burn",
      url: "https://example.test/deck/deck-1",
      description: "Fast aggressive deck",
      dateModified: UPDATED_AT.toISOString(),
      genre: "Magic: The Gathering Modern deck",
      author: { "@type": "Person", name: "alice" },
    });
  });

  it("omits the author block when there is no username", () => {
    const ld = buildDeckJsonLd(makeDeck({ user: null }));
    expect(ld).not.toHaveProperty("author");
  });

  it("returns null for UNLISTED decks", () => {
    expect(buildDeckJsonLd(makeDeck({ visibility: "UNLISTED" }))).toBeNull();
  });

  it("returns null for PRIVATE decks", () => {
    expect(buildDeckJsonLd(makeDeck({ visibility: "PRIVATE" }))).toBeNull();
  });

  it("returns null for a PUBLIC wishlist", () => {
    expect(
      buildDeckJsonLd(makeDeck({ visibility: "PUBLIC", kind: "WISHLIST" })),
    ).toBeNull();
  });

  it("returns null when the deck is missing", () => {
    expect(buildDeckJsonLd(null)).toBeNull();
  });
});
