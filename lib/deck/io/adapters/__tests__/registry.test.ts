import { describe, expect, it } from "vitest";
import { adapters } from "../index";
import { dekAdapter } from "../dek";
import { detectFormat, parseDecklist } from "../../parse";

describe("detectFormat — confidence-based selection", () => {
  it("selects dek format for XML input", () => {
    expect(detectFormat('<?xml version="1.0"?><Deck/>')).toBe("dek");
    expect(detectFormat("<Deck/>")).toBe("dek");
  });

  it("selects arena format when 'Deck' header is present", () => {
    expect(detectFormat("Deck\n4 Lightning Bolt")).toBe("arena");
  });

  it("selects text format for plain decklists", () => {
    expect(detectFormat("4 Lightning Bolt")).toBe("text");
  });

  it("disambiguates: arena beats text when both detect", () => {
    // Both text (0.4) and arena (0.9) match — arena wins.
    expect(detectFormat("Deck\n4 Lightning Bolt")).toBe("arena");
  });

  it("registry is non-empty and well-formed", () => {
    expect(adapters.length).toBeGreaterThanOrEqual(3);
    for (const a of adapters) {
      expect(typeof a.id).toBe("string");
      expect(typeof a.detect).toBe("function");
      expect(typeof a.parse).toBe("function");
      expect(typeof a.serialize).toBe("function");
    }
  });
});

describe("parseDecklist — explicit-format dispatch", () => {
  it("returns text format when called with text", () => {
    expect(parseDecklist("4 Lightning Bolt", "text").format).toBe("text");
  });

  it("returns arena format when called with arena", () => {
    expect(parseDecklist("Deck\n4 Lightning Bolt", "arena").format).toBe(
      "arena",
    );
  });

  it("returns dek format when called with dek", () => {
    const dek =
      '<?xml version="1.0"?><Deck><Cards Quantity="4" Sideboard="false" Name="Lightning Bolt"/></Deck>';
    const result = parseDecklist(dek, "dek");
    expect(result.format).toBe("dek");
    expect(result.cards).toHaveLength(1);
  });
});

describe("dekAdapter.serialize", () => {
  it("throws because DEK serialization is not supported", () => {
    expect(() =>
      dekAdapter.serialize({
        id: "deck1",
        name: "x",
        format: "COMMANDER",
        visibility: "PRIVATE",
        description: null,
        cards: [],
        categories: [],
      } as never),
    ).toThrow("DEK serialization is not supported");
  });
});
