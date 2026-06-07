import { describe, expect, it } from "vitest";
import { parseDeckList } from "../line-parser";

describe("parseDeckList", () => {
  it("parses a bare quantity + name line", () => {
    const out = parseDeckList("4 Lightning Bolt");
    expect(out).toEqual([{ name: "Lightning Bolt", quantity: 4, isFoil: false }]);
  });

  it("parses Moxfield-style `(SET) NUM` suffix", () => {
    const out = parseDeckList("1 Sol Ring (C21) 263");
    expect(out).toEqual([
      {
        name: "Sol Ring",
        quantity: 1,
        set: "C21",
        collectorNumber: "263",
        isFoil: false,
      },
    ]);
  });

  it("parses Archidekt-style `[SET]` suffix", () => {
    const out = parseDeckList("2 Counterspell [MH2]");
    expect(out).toEqual([
      {
        name: "Counterspell",
        quantity: 2,
        set: "MH2",
        collectorNumber: undefined,
        isFoil: false,
      },
    ]);
  });

  it("uppercases lowercase set codes", () => {
    const out = parseDeckList("1 Sol Ring (c21) 263");
    expect(out[0]!.set).toBe("C21");
  });

  it("accepts non-numeric collector numbers", () => {
    const out = parseDeckList("1 Black Lotus (LEA) 232a");
    expect(out[0]!.collectorNumber).toBe("232a");
  });

  it("merges duplicate lines with the same name+set+number", () => {
    const out = parseDeckList(
      ["1 Sol Ring (C21) 263", "2 Sol Ring (C21) 263"].join("\n"),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(3);
  });

  it("keeps differently-printed copies as separate entries", () => {
    const out = parseDeckList(
      ["1 Sol Ring (C21) 263", "1 Sol Ring (CMR) 472"].join("\n"),
    );
    expect(out).toHaveLength(2);
  });

  it("ignores blank lines and unparseable junk", () => {
    const out = parseDeckList(
      ["", "// commander", "1 Sol Ring", "  ", "not a card"].join("\n"),
    );
    expect(out).toEqual([{ name: "Sol Ring", quantity: 1, isFoil: false }]);
  });

  it("rejects zero and negative quantities", () => {
    expect(parseDeckList("0 Sol Ring")).toEqual([]);
  });

  it("rejects quantities exceeding MAX_CARD_QTY (overflow guard)", () => {
    // "9".repeat(21) parses to 9e20 in JS which is not an integer, so skipped.
    expect(parseDeckList("99999999999999999999 Sol Ring")).toEqual([]);
  });

  it("trims surrounding whitespace on each line", () => {
    const out = parseDeckList("   3 Brainstorm   ");
    expect(out).toEqual([{ name: "Brainstorm", quantity: 3, isFoil: false }]);
  });

  it("parses a multi-line decklist", () => {
    const out = parseDeckList(
      [
        "1 Atraxa, Praetors' Voice (C16) 28",
        "1 Sol Ring (C21) 263",
        "1 Counterspell [MH2]",
        "10 Island",
      ].join("\n"),
    );
    expect(out).toHaveLength(4);
    expect(out.map((c) => c.name)).toEqual([
      "Atraxa, Praetors' Voice",
      "Sol Ring",
      "Counterspell",
      "Island",
    ]);
  });

  it("parses trailing *F* foil marker", () => {
    const out = parseDeckList("1 Earthbender Ascension (TLA) 175 *F*");
    expect(out[0]).toMatchObject({
      name: "Earthbender Ascension",
      quantity: 1,
      set: "TLA",
      collectorNumber: "175",
      isFoil: true,
    });
  });

  it("parses trailing *E* etched-foil marker as foil", () => {
    const out = parseDeckList("1 Verdant Catacombs (MH2) 440 *E*");
    expect(out[0]).toMatchObject({
      name: "Verdant Catacombs",
      quantity: 1,
      set: "MH2",
      collectorNumber: "440",
      isFoil: true,
    });
  });

  it("parses foil marker without set/collector", () => {
    const out = parseDeckList("1 Lightning Bolt *F*");
    expect(out[0]).toMatchObject({
      name: "Lightning Bolt",
      quantity: 1,
      isFoil: true,
    });
    expect(out[0]!.set).toBeUndefined();
    expect(out[0]!.collectorNumber).toBeUndefined();
  });

  it("strips trailing #... comment", () => {
    const out = parseDeckList("1 Bitter Triumph (SCH) 42 #remove");
    expect(out[0]).toMatchObject({
      name: "Bitter Triumph",
      set: "SCH",
      collectorNumber: "42",
      isFoil: false,
    });
  });

  it("handles #comment combined with *F*", () => {
    const out = parseDeckList("1 Sol Ring (C21) 263 *F* #note");
    expect(out[0]).toMatchObject({
      name: "Sol Ring",
      set: "C21",
      collectorNumber: "263",
      isFoil: true,
    });
  });

  it("defaults isFoil: false when no marker present", () => {
    const out = parseDeckList("1 Sol Ring (C21) 263");
    expect(out[0]!.isFoil).toBe(false);
  });

  it("keeps foil and nonfoil copies of the same printing as separate entries", () => {
    const out = parseDeckList(
      ["1 Sol Ring (C21) 263", "1 Sol Ring (C21) 263 *F*"].join("\n"),
    );
    expect(out).toHaveLength(2);
    const foil = out.find((c) => c.isFoil === true);
    const nonfoil = out.find((c) => c.isFoil === false);
    expect(foil?.quantity).toBe(1);
    expect(nonfoil?.quantity).toBe(1);
  });

  it("merges two foil copies of the same printing", () => {
    const out = parseDeckList(
      ["1 Sol Ring (C21) 263 *F*", "1 Sol Ring (C21) 263 *F*"].join("\n"),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ quantity: 2, isFoil: true });
  });

  it("tolerates hyphenated collector numbers", () => {
    const out = parseDeckList("1 Urza's Saga (PLST) MH2-259");
    expect(out[0]).toMatchObject({
      name: "Urza's Saga",
      set: "PLST",
      collectorNumber: "MH2-259",
    });
  });

  it("tolerates alphanumeric collector suffix with foil", () => {
    const out = parseDeckList("1 Blossoming Tortoise (PWOE) 163p *F*");
    expect(out[0]).toMatchObject({
      name: "Blossoming Tortoise",
      set: "PWOE",
      collectorNumber: "163p",
      isFoil: true,
    });
  });

  it("normalizes single-slash MDFC separator to Scryfall-canonical double-slash", () => {
    const out = parseDeckList("1 Hagra Mauling / Hagra Broodpit (ZNR) 106 *F*");
    expect(out[0]).toMatchObject({
      name: "Hagra Mauling // Hagra Broodpit",
      quantity: 1,
      set: "ZNR",
      collectorNumber: "106",
      isFoil: true,
    });
  });

  it("normalizes MDFC separator for non-foil lines too", () => {
    const out = parseDeckList("1 Boggart Trawler / Boggart Bog (MH3) 243");
    expect(out[0]).toMatchObject({
      name: "Boggart Trawler // Boggart Bog",
      quantity: 1,
      set: "MH3",
      collectorNumber: "243",
      isFoil: false,
    });
  });

  it("leaves already-canonical double-slash MDFC names unchanged", () => {
    const out = parseDeckList("1 Hagra Mauling // Hagra Broodpit (ZNR) 106");
    expect(out[0]?.name).toBe("Hagra Mauling // Hagra Broodpit");
  });
});
