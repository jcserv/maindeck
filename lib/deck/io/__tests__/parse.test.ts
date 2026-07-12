import { describe, expect, it } from "vitest";
import { detectFormat, parseDecklist } from "../parse";

function autoParse(input: string) {
  return parseDecklist(input, detectFormat(input));
}

describe("detectFormat", () => {
  it("detects plain text as 'text'", () => {
    expect(detectFormat("4 Lightning Bolt")).toBe("text");
  });

  it("detects Arena format when 'Deck' header is present", () => {
    expect(detectFormat("Deck\n4 Lightning Bolt")).toBe("arena");
  });

  it("detects DEK (XML) format", () => {
    expect(detectFormat('<?xml version="1.0"?><Deck></Deck>')).toBe("dek");
  });
});

describe("parseDecklist — section detection", () => {
  it("defaults to MAINBOARD zone when no section header is present", () => {
    const { cards } = autoParse("4 Lightning Bolt");
    expect(cards[0]!.zone).toBe("MAINBOARD");
    expect(cards[0]!.categories).toEqual([]);
  });

  it("assigns SIDEBOARD zone after //Sideboard header", () => {
    const input = ["4 Lightning Bolt", "//Sideboard", "2 Duress"].join("\n");
    const { cards } = autoParse(input);
    expect(cards.find((c) => c.name === "Lightning Bolt")?.zone).toBe(
      "MAINBOARD",
    );
    expect(cards.find((c) => c.name === "Duress")?.zone).toBe("SIDEBOARD");
  });

  it("handles 'Sideboard' bare header (Arena style)", () => {
    const input = ["Deck", "4 Lightning Bolt", "", "Sideboard", "2 Duress"].join(
      "\n",
    );
    const { cards } = autoParse(input);
    expect(cards.find((c) => c.name === "Duress")?.zone).toBe("SIDEBOARD");
  });

  it("handles //Considering header", () => {
    const input = ["1 Sol Ring", "//Considering", "1 Mana Vault"].join("\n");
    const { cards } = autoParse(input);
    expect(cards.find((c) => c.name === "Mana Vault")?.zone).toBe(
      "CONSIDERING",
    );
  });

  it("handles Maybeboard header as CONSIDERING", () => {
    const input = ["1 Sol Ring", "Maybeboard", "1 Mana Vault"].join("\n");
    const { cards } = autoParse(input);
    expect(cards.find((c) => c.name === "Mana Vault")?.zone).toBe(
      "CONSIDERING",
    );
  });

  it("handles Commander header → COMMANDER zone", () => {
    const input = ["Commander:", "1 Atraxa, Praetors' Voice"].join("\n");
    const { cards } = autoParse(input);
    expect(cards[0]!.zone).toBe("COMMANDER");
    expect(cards[0]!.categories).toEqual([]);
  });

  it("re-uses the last set zone across multiple cards", () => {
    const input = [
      "//Mainboard",
      "4 Island",
      "4 Mountain",
      "//Sideboard",
      "2 Duress",
      "2 Negate",
    ].join("\n");
    const { cards } = autoParse(input);
    expect(cards.filter((c) => c.zone === "MAINBOARD")).toHaveLength(2);
    expect(cards.filter((c) => c.zone === "SIDEBOARD")).toHaveLength(2);
  });

  it("always emits categories: [] on parse (subcategories not serialized in text)", () => {
    const { cards } = autoParse("4 Lightning Bolt\n//Sideboard\n2 Duress");
    for (const c of cards) {
      expect(c.categories).toEqual([]);
    }
  });
});

describe("parseDecklist — card parsing", () => {
  it("parses quantity and name", () => {
    const { cards } = autoParse("4 Lightning Bolt");
    expect(cards[0]).toMatchObject({ name: "Lightning Bolt", quantity: 4 });
  });

  it("parses set and collector number", () => {
    const { cards } = autoParse("1 Sol Ring (C21) 263");
    expect(cards[0]).toMatchObject({
      name: "Sol Ring",
      set: "C21",
      collectorNumber: "263",
    });
  });

  it("skips empty lines without adding to unmatched", () => {
    const { unmatchedLines, cards } = autoParse("\n\n4 Lightning Bolt\n\n");
    expect(cards).toHaveLength(1);
    expect(unmatchedLines).toHaveLength(0);
  });

  it("skips pure comment lines (// only)", () => {
    const { cards, unmatchedLines } = autoParse(
      "// This is a comment\n4 Lightning Bolt",
    );
    expect(cards).toHaveLength(1);
    expect(unmatchedLines).toHaveLength(0);
  });
});

describe("parseDecklist — unmatched lines", () => {
  it("adds lines that look like cards but fail to parse to unmatchedLines", () => {
    const { unmatchedLines } = autoParse("3 ???");
    expect(Array.isArray(unmatchedLines)).toBe(true);
  });

  it("does not include section headers in unmatchedLines", () => {
    const { unmatchedLines } = autoParse("//Sideboard\n4 Lightning Bolt");
    expect(unmatchedLines).toHaveLength(0);
  });
});

describe("parseDecklist — DEK XML", () => {
  it("parses mainboard and sideboard cards from DEK XML", () => {
    const dek = `<?xml version="1.0" encoding="utf-8"?>
<Deck xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Cards CatID="1" Quantity="4" Sideboard="false" Name="Lightning Bolt" />
  <Cards CatID="2" Quantity="2" Sideboard="true" Name="Duress" />
</Deck>`;
    const { format, cards } = autoParse(dek);
    expect(format).toBe("dek");
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.name === "Lightning Bolt")?.zone).toBe(
      "MAINBOARD",
    );
    expect(cards.find((c) => c.name === "Duress")?.zone).toBe("SIDEBOARD");
    expect(cards[0]!.isFoil).toBe(false);
  });

  it("warns when DEK has no card entries", () => {
    const { warnings } = autoParse("<?xml?><Deck></Deck>");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("parseDecklist — foil propagation", () => {
  it("propagates isFoil from line parser", () => {
    const { cards } = autoParse("1 Sol Ring (C21) 263 *F*");
    expect(cards[0]).toMatchObject({
      name: "Sol Ring",
      isFoil: true,
    });
  });

  it("defaults isFoil: false for plain lines", () => {
    const { cards } = autoParse("4 Lightning Bolt");
    expect(cards[0]!.isFoil).toBe(false);
  });
});
