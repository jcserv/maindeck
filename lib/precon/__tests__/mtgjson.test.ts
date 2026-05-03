import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchMtgjsonDeck,
  fetchMtgjsonDeckList,
  fetchMtgjsonMeta,
} from "../mtgjson";

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("throwForStatus 429 / parseRetryAfter", () => {
  it("throws RetryableError on 429 with integer Retry-After (seconds)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 429, headers: { "retry-after": "30" } }),
    );
    await expect(fetchMtgjsonMeta()).rejects.toThrow(/429 rate limited/);
  });

  it("throws RetryableError on 429 with HTTP-date Retry-After", async () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 429, headers: { "retry-after": future } }),
    );
    await expect(fetchMtgjsonMeta()).rejects.toThrow(/429 rate limited/);
  });

  it("throws RetryableError on 429 with no Retry-After header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 429 }),
    );
    await expect(fetchMtgjsonMeta()).rejects.toThrow(/429 rate limited/);
  });

  it("throws RetryableError on 429 with unparseable Retry-After value", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 429, headers: { "retry-after": "not-a-date" } }),
    );
    await expect(fetchMtgjsonMeta()).rejects.toThrow(/429 rate limited/);
  });
});

describe("fetchMtgjsonMeta", () => {
  it("returns version and date and sends UA + Accept headers", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ data: { version: "5.2.3", date: "2026-04-01" } }),
      );

    const out = await fetchMtgjsonMeta();
    expect(out).toEqual({ version: "5.2.3", date: "2026-04-01" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://mtgjson.com/api/v5/Meta.json",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "maindeck/0.1",
          Accept: "application/json",
        }),
      }),
    );
  });

  it("throws on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 }),
    );
    await expect(fetchMtgjsonMeta()).rejects.toThrow(/404/);
  });

  it("throws on malformed top-level body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(null));
    await expect(fetchMtgjsonMeta()).rejects.toThrow(/malformed/);
  });

  it("throws when version or date is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: { version: 5, date: "2026-04-01" } }),
    );
    await expect(fetchMtgjsonMeta()).rejects.toThrow(
      /missing version\/date/,
    );
  });
});

describe("fetchMtgjsonDeckList", () => {
  it("returns valid entries and silently drops malformed ones", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        data: [
          {
            code: "TST",
            fileName: "Test_TST.json",
            name: "Test",
            releaseDate: "2026-01-01",
          },
          { code: "BAD" }, // missing fields
          null,
          "garbage",
          {
            code: "OK",
            fileName: "OK.json",
            name: "OK Deck",
            releaseDate: "2026-02-02",
          },
        ],
      }),
    );

    const out = await fetchMtgjsonDeckList();
    expect(out).toHaveLength(2);
    expect(out[0]?.code).toBe("TST");
    expect(out[1]?.code).toBe("OK");
  });

  it("throws on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 }),
    );
    await expect(fetchMtgjsonDeckList()).rejects.toThrow(/404/);
  });

  it("throws on malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: "not-an-array" }),
    );
    await expect(fetchMtgjsonDeckList()).rejects.toThrow(/malformed/);
  });
});

describe("fetchMtgjsonDeck", () => {
  function deckBody(overrides: Record<string, unknown> = {}): unknown {
    return {
      data: {
        code: "TST",
        name: "Test Deck",
        type: "Commander Deck",
        releaseDate: "2026-01-01",
        commander: [{ name: "Atraxa", count: 1 }],
        mainBoard: [
          { name: "Sol Ring", count: 1 },
          { name: "", count: 4 }, // dropped: empty name
          { name: "Bad Count", count: 0 }, // dropped: count <= 0
          { name: "Wrong Count Type", count: "4" }, // dropped: non-numeric
          "not-an-object", // dropped
        ],
        sideBoard: [],
        ...overrides,
      },
    };
  }

  it("parses required fields and filters bad cards", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(deckBody()));

    const out = await fetchMtgjsonDeck("Test_TST.json");
    expect(out.code).toBe("TST");
    expect(out.name).toBe("Test Deck");
    expect(out.type).toBe("Commander Deck");
    expect(out.releaseDate).toBe("2026-01-01");
    expect(out.commander).toEqual([{ name: "Atraxa", count: 1 }]);
    expect(out.mainBoard).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(out.sideBoard).toEqual([]);
  });

  it("treats non-array board fields as empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        deckBody({ commander: undefined, mainBoard: null, sideBoard: 42 }),
      ),
    );
    const out = await fetchMtgjsonDeck("Test_TST.json");
    expect(out.commander).toEqual([]);
    expect(out.mainBoard).toEqual([]);
    expect(out.sideBoard).toEqual([]);
  });

  it("throws on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 }),
    );
    await expect(fetchMtgjsonDeck("Missing.json")).rejects.toThrow(/404/);
  });

  it("throws on malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));
    await expect(fetchMtgjsonDeck("Test.json")).rejects.toThrow(/malformed/);
  });

  it("throws when required string fields are missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(deckBody({ name: 123 })),
    );
    await expect(fetchMtgjsonDeck("Test.json")).rejects.toThrow(
      /missing required fields/,
    );
  });

  it("appends .json when fileName lacks the suffix", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(deckBody()));

    await fetchMtgjsonDeck("ArcanisSGuile_10E");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://mtgjson.com/api/v5/decks/ArcanisSGuile_10E.json",
      expect.anything(),
    );
  });
});
