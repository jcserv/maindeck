import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { archidektAdapter } from "../external/archidekt";
import { moxfieldAdapter } from "../external/moxfield";
import { ExternalFetchError, getSourceForUrl } from "../external/index";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── ExternalFetchError ───────────────────────────────────────────────────────

describe("ExternalFetchError", () => {
  it("sets name and message", () => {
    const err = new ExternalFetchError("something failed");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ExternalFetchError");
    expect(err.message).toBe("something failed");
  });
});

// ─── getSourceForUrl ──────────────────────────────────────────────────────────

describe("getSourceForUrl", () => {
  it("returns archidekt adapter for archidekt URLs", () => {
    expect(getSourceForUrl("https://archidekt.com/decks/123")).toBe(archidektAdapter);
  });

  it("returns moxfield adapter for moxfield URLs", () => {
    expect(getSourceForUrl("https://moxfield.com/decks/abc")).toBe(moxfieldAdapter);
  });

  it("returns null for unrecognised URLs", () => {
    expect(getSourceForUrl("https://example.com/decks/abc")).toBeNull();
  });
});

// ─── archidektAdapter ────────────────────────────────────────────────────────

describe("archidektAdapter.detect", () => {
  it("returns true for archidekt deck URLs", () => {
    expect(archidektAdapter.detect("https://archidekt.com/decks/10009033")).toBe(true);
  });

  it("returns false for non-archidekt URLs", () => {
    expect(archidektAdapter.detect("https://moxfield.com/decks/abc")).toBe(false);
    expect(archidektAdapter.detect("https://example.com")).toBe(false);
  });
});

describe("archidektAdapter.fetch", () => {
  it("404s when URL contains no archidekt deck id", async () => {
    await expect(archidektAdapter.fetch("https://archidekt.com/user/profile")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("throws ExternalFetchError when network request fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    await expect(
      archidektAdapter.fetch("https://archidekt.com/decks/123"),
    ).rejects.toThrow(ExternalFetchError);
  });

  it("throws ExternalFetchError when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(
      archidektAdapter.fetch("https://archidekt.com/decks/123"),
    ).rejects.toThrow(ExternalFetchError);
  });

  it("parses a successful Archidekt API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Test Deck",
        deckFormat: 3,
        cards: [
          {
            card: { oracleCard: { name: "Sol Ring" } },
            quantity: 1,
            categories: ["mainboard"],
          },
          {
            card: { oracleCard: { name: "Black Lotus" } },
            quantity: 1,
            categories: ["commander"],
          },
          {
            card: { oracleCard: { name: "Brainstorm" } },
            quantity: 1,
            categories: ["sideboard"],
          },
          {
            card: { oracleCard: { name: "Path to Exile" } },
            quantity: 1,
            categories: ["maybeboard"],
          },
        ],
      }),
    });

    const result = await archidektAdapter.fetch("https://archidekt.com/decks/123");

    expect(result.name).toBe("Test Deck");
    expect(result.format).toBe("COMMANDER");
    expect(result.entries).toHaveLength(4);
    expect(result.entries.find((e) => e.name === "Sol Ring")?.zone).toBe("MAINBOARD");
    expect(result.entries.find((e) => e.name === "Black Lotus")?.zone).toBe("COMMANDER");
    expect(result.entries.find((e) => e.name === "Brainstorm")?.zone).toBe("SIDEBOARD");
    expect(result.entries.find((e) => e.name === "Path to Exile")?.zone).toBe("CONSIDERING");
  });

  it("defaults unrecognised category to MAINBOARD", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "My Deck",
        deckFormat: 1,
        cards: [
          {
            card: { oracleCard: { name: "Lightning Bolt" } },
            quantity: 4,
            categories: ["Ramp"],
          },
        ],
      }),
    });

    const result = await archidektAdapter.fetch("https://archidekt.com/decks/456");

    expect(result.entries[0]!.zone).toBe("MAINBOARD");
  });

  it("skips slots with no oracle card name", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "My Deck",
        deckFormat: 3,
        cards: [
          { card: {}, quantity: 1, categories: [] },
          { card: { oracleCard: { name: "Sol Ring" } }, quantity: 1, categories: [] },
        ],
      }),
    });

    const result = await archidektAdapter.fetch("https://archidekt.com/decks/789");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.name).toBe("Sol Ring");
  });

  it("falls back to CASUAL for unrecognised deckFormat", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Casual Deck",
        deckFormat: 99,
        cards: [],
      }),
    });

    const result = await archidektAdapter.fetch("https://archidekt.com/decks/999");

    expect(result.format).toBe("CASUAL");
  });

  it("uses fallback name when API name is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deckFormat: 3, cards: [] }),
    });

    const result = await archidektAdapter.fetch("https://archidekt.com/decks/111");

    expect(result.name).toBe("Archidekt Deck");
  });
});

// ─── moxfieldAdapter ─────────────────────────────────────────────────────────

describe("moxfieldAdapter.detect", () => {
  it("returns true for moxfield deck URLs", () => {
    expect(moxfieldAdapter.detect("https://moxfield.com/decks/1bBKr")).toBe(true);
  });

  it("returns false for non-moxfield URLs", () => {
    expect(moxfieldAdapter.detect("https://archidekt.com/decks/123")).toBe(false);
    expect(moxfieldAdapter.detect("https://example.com")).toBe(false);
  });
});

describe("moxfieldAdapter.fetch", () => {
  it("404s when URL contains no moxfield deck id", async () => {
    await expect(moxfieldAdapter.fetch("https://moxfield.com/user/profile")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("throws ExternalFetchError when network request fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    await expect(
      moxfieldAdapter.fetch("https://moxfield.com/decks/abc123"),
    ).rejects.toThrow(ExternalFetchError);
  });

  it("throws ExternalFetchError with Cloudflare block message on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(
      moxfieldAdapter.fetch("https://moxfield.com/decks/abc123"),
    ).rejects.toThrow("Moxfield's API blocks server-side requests");
  });

  it("throws ExternalFetchError with Cloudflare block message on 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(
      moxfieldAdapter.fetch("https://moxfield.com/decks/abc123"),
    ).rejects.toThrow("Moxfield's API blocks server-side requests");
  });

  it("throws ExternalFetchError for other non-ok statuses", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(
      moxfieldAdapter.fetch("https://moxfield.com/decks/abc123"),
    ).rejects.toThrow(ExternalFetchError);
  });

  it("parses a successful Moxfield API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "My Commander Deck",
        format: "commander",
        boards: {
          mainboard: {
            cards: {
              card1: { card: { name: "Sol Ring" }, quantity: 1 },
            },
          },
          commanders: {
            cards: {
              cmd1: { card: { name: "Atraxa" }, quantity: 1 },
            },
          },
          sideboard: {
            cards: {},
          },
          maybeboard: {
            cards: {
              maybe1: { card: { name: "Path to Exile" }, quantity: 2 },
            },
          },
        },
      }),
    });

    const result = await moxfieldAdapter.fetch("https://moxfield.com/decks/abc123");

    expect(result.name).toBe("My Commander Deck");
    expect(result.format).toBe("COMMANDER");

    const solRing = result.entries.find((e) => e.name === "Sol Ring");
    expect(solRing?.zone).toBe("MAINBOARD");
    expect(solRing?.quantity).toBe(1);

    const atraxa = result.entries.find((e) => e.name === "Atraxa");
    expect(atraxa?.zone).toBe("COMMANDER");

    const pathToExile = result.entries.find((e) => e.name === "Path to Exile");
    expect(pathToExile?.zone).toBe("CONSIDERING");
    expect(pathToExile?.quantity).toBe(2);
  });

  it("falls back to CASUAL for unrecognised format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Unknown Format Deck",
        format: "unknownformat",
        boards: {},
      }),
    });

    const result = await moxfieldAdapter.fetch("https://moxfield.com/decks/xyz");

    expect(result.format).toBe("CASUAL");
  });

  it("uses fallback name when API name is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ format: "commander", boards: {} }),
    });

    const result = await moxfieldAdapter.fetch("https://moxfield.com/decks/xyz");

    expect(result.name).toBe("Moxfield Deck");
  });

  it("skips board entries with no card name", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Deck",
        format: "commander",
        boards: {
          mainboard: {
            cards: {
              empty: { card: {}, quantity: 1 },
              valid: { card: { name: "Sol Ring" }, quantity: 1 },
            },
          },
        },
      }),
    });

    const result = await moxfieldAdapter.fetch("https://moxfield.com/decks/xyz");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.name).toBe("Sol Ring");
  });
});
