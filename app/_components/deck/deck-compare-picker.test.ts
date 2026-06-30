import { describe, expect, it } from "vitest";
import { parseDeckRef } from "./deck-compare-picker";

describe("parseDeckRef", () => {
  it("returns null for empty string", () => {
    expect(parseDeckRef("")).toBeNull();
  });

  it("returns null for whitespace", () => {
    expect(parseDeckRef("   ")).toBeNull();
  });

  it("returns bare id", () => {
    expect(parseDeckRef("abc123")).toBe("abc123");
  });

  it("parses maindeck /deck/ URL", () => {
    expect(parseDeckRef("https://maindeck.app/deck/abc123")).toBe("abc123");
  });

  it("parses moxfield /decks/ URL", () => {
    expect(parseDeckRef("https://moxfield.com/decks/1bBKr_Si1Uu-MnzSti_b8A")).toBe(
      "1bBKr_Si1Uu-MnzSti_b8A",
    );
  });

  it("parses archidekt /decks/<id>/<slug> URL — returns numeric id only", () => {
    expect(parseDeckRef("https://archidekt.com/decks/10009033/king_husbands_deck")).toBe(
      "10009033",
    );
  });

  it("strips query params", () => {
    expect(parseDeckRef("https://example.com/decks/abc?ref=share")).toBe("abc");
  });

  it("strips hash", () => {
    expect(parseDeckRef("https://example.com/deck/abc#section")).toBe("abc");
  });

  it("returns null for URL with no deck segment", () => {
    expect(parseDeckRef("https://example.com/user/profile")).toBeNull();
  });

  it("returns null for string with spaces that is not a URL", () => {
    expect(parseDeckRef("not a valid ref")).toBeNull();
  });
});
