import { describe, expect, it } from "vitest";
import { parseManifestEntries, parseScryfallCard } from "../parse";

describe("parseManifestEntries", () => {
  it("throws on a non-object", () => {
    expect(() => parseManifestEntries(null)).toThrow(/malformed/);
    expect(() => parseManifestEntries("oops")).toThrow(/malformed/);
  });

  it("throws when data is missing or not an array", () => {
    expect(() => parseManifestEntries({})).toThrow(/malformed/);
    expect(() => parseManifestEntries({ data: "no" })).toThrow(/malformed/);
  });

  it("returns valid entries and silently drops malformed ones", () => {
    const out = parseManifestEntries({
      data: [
        {
          type: "default_cards",
          download_uri: "https://x/d.json",
          updated_at: "2026-01-01",
        },
        { type: "broken" },
        null,
        {
          type: "oracle_cards",
          download_uri: "https://x/o.json",
          updated_at: "2026-01-02",
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.type).toBe("default_cards");
    expect(out[1]!.type).toBe("oracle_cards");
  });
});

describe("parseScryfallCard", () => {
  function valid() {
    return {
      id: "x",
      lang: "en",
      layout: "normal",
      games: ["paper"],
      name: "Card",
      set: "tst",
      set_name: "Test",
      collector_number: "1",
    };
  }

  it("returns the card when all required fields are present", () => {
    const out = parseScryfallCard(valid());
    expect(out).not.toBeNull();
    expect(out?.name).toBe("Card");
  });

  it("returns null for non-objects", () => {
    expect(parseScryfallCard(null)).toBeNull();
    expect(parseScryfallCard("nope")).toBeNull();
    expect(parseScryfallCard(42)).toBeNull();
  });

  it.each([
    "id",
    "lang",
    "layout",
    "name",
    "set",
    "set_name",
    "collector_number",
  ])("returns null when %s is missing", (key) => {
    const card = valid() as Record<string, unknown>;
    delete card[key];
    expect(parseScryfallCard(card)).toBeNull();
  });

  it("returns null when name is an empty string", () => {
    const card = valid();
    card.name = "";
    expect(parseScryfallCard(card)).toBeNull();
  });

  it("returns null when games is not an array of strings", () => {
    const card = valid() as Record<string, unknown>;
    card["games"] = "paper";
    expect(parseScryfallCard(card)).toBeNull();
    card["games"] = [1, 2];
    expect(parseScryfallCard(card)).toBeNull();
  });

  it("returns null when a required string is the wrong type", () => {
    const card = valid() as Record<string, unknown>;
    card["id"] = 123;
    expect(parseScryfallCard(card)).toBeNull();
  });
});
