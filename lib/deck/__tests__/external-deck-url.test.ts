import { describe, expect, it } from "vitest";
import { detectExternalSource, isExternalDeckUrl } from "../external-deck-url";

describe("detectExternalSource", () => {
  it("identifies moxfield URLs", () => {
    expect(detectExternalSource("https://moxfield.com/decks/abc123")).toBe("moxfield");
  });

  it("identifies archidekt URLs", () => {
    expect(detectExternalSource("https://archidekt.com/decks/10009033/deck-name")).toBe("archidekt");
  });

  it("returns null for unrecognised URLs", () => {
    expect(detectExternalSource("https://example.com/decks/abc")).toBeNull();
    expect(detectExternalSource("")).toBeNull();
  });

  it("trims whitespace before matching", () => {
    expect(detectExternalSource("  https://moxfield.com/decks/abc  ")).toBe("moxfield");
  });
});

describe("isExternalDeckUrl", () => {
  it("returns true for known external sources", () => {
    expect(isExternalDeckUrl("https://moxfield.com/decks/abc")).toBe(true);
    expect(isExternalDeckUrl("https://archidekt.com/decks/123")).toBe(true);
  });

  it("returns false for unknown URLs", () => {
    expect(isExternalDeckUrl("https://maindeck.app/deck/abc")).toBe(false);
    expect(isExternalDeckUrl("not-a-url")).toBe(false);
  });
});
