import { describe, expect, it } from "vitest";
import { adapters, parseImportText, pickAdapter } from "../index";

describe("pickAdapter — confidence-based selection", () => {
  it("selects dek adapter for XML input", () => {
    expect(pickAdapter('<?xml version="1.0"?><Deck/>').id).toBe("dek");
    expect(pickAdapter("<Deck/>").id).toBe("dek");
  });

  it("selects arena adapter when 'Deck' header is present", () => {
    expect(pickAdapter("Deck\n4 Lightning Bolt").id).toBe("arena");
  });

  it("selects text adapter for plain decklists", () => {
    expect(pickAdapter("4 Lightning Bolt").id).toBe("text");
  });

  it("disambiguates: arena beats text when both detect", () => {
    // Both text (0.4) and arena (0.9) match — arena wins.
    const adapter = pickAdapter("Deck\n4 Lightning Bolt");
    expect(adapter.id).toBe("arena");
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

describe("parseImportText — façade preserves behavior", () => {
  it("returns text format for plain input", () => {
    expect(parseImportText("4 Lightning Bolt").format).toBe("text");
  });

  it("returns arena format when Deck header present", () => {
    expect(parseImportText("Deck\n4 Lightning Bolt").format).toBe("arena");
  });

  it("returns dek format for XML input", () => {
    const dek = '<?xml version="1.0"?><Deck><Cards Quantity="4" Sideboard="false" Name="Lightning Bolt"/></Deck>';
    const result = parseImportText(dek);
    expect(result.format).toBe("dek");
    expect(result.cards).toHaveLength(1);
  });
});
