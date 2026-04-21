import { describe, expect, it } from "vitest";
import {
  buildSetSuggestions,
  filterPrintings,
  isExactSingleSetMatch,
} from "../printing-filter";

interface FakePrinting {
  setName: string;
  setCode: string;
  collectorNumber: string;
}

function p(
  setCode: string,
  setName: string,
  collectorNumber: string,
): FakePrinting {
  return { setCode, setName, collectorNumber };
}

const printings: FakePrinting[] = [
  p("BLC", "Bloomburrow Commander", "129"),
  p("BLC", "Bloomburrow Commander", "130"),
  p("C21", "Commander 2021", "42"),
  p("LEA", "Limited Edition Alpha", "270"),
  p("AFC", "Forgotten Realms Commander", "5"),
];

describe("filterPrintings", () => {
  it("returns all printings when query is empty", () => {
    expect(filterPrintings(printings, "")).toHaveLength(printings.length);
  });

  it("returns all printings when query is only whitespace", () => {
    expect(filterPrintings(printings, "   ")).toHaveLength(printings.length);
  });

  it("matches by set name substring (case-insensitive)", () => {
    const result = filterPrintings(printings, "bloomburrow");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.setCode === "BLC")).toBe(true);
  });

  it("matches by set code (case-insensitive)", () => {
    const result = filterPrintings(printings, "blc");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.setCode === "BLC")).toBe(true);
  });

  it("matches by collector number", () => {
    const result = filterPrintings(printings, "270");
    expect(result).toEqual([p("LEA", "Limited Edition Alpha", "270")]);
  });

  it("returns empty array when no match", () => {
    expect(filterPrintings(printings, "zzz-nope")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...printings];
    filterPrintings(input, "blc");
    expect(input).toEqual(printings);
  });

  it("returns a new array when query is empty (does not return the same reference)", () => {
    const result = filterPrintings(printings, "");
    expect(result).not.toBe(printings);
    expect(result).toEqual(printings);
  });
});

describe("buildSetSuggestions", () => {
  it("returns empty array when query is empty", () => {
    expect(buildSetSuggestions(printings, "")).toEqual([]);
  });

  it("returns empty array when query is only whitespace", () => {
    expect(buildSetSuggestions(printings, "   ")).toEqual([]);
  });

  it("dedupes by set code and counts printings", () => {
    const result = buildSetSuggestions(printings, "commander");
    const blc = result.find((s) => s.setCode === "BLC");
    expect(blc).toEqual({
      setCode: "BLC",
      setName: "Bloomburrow Commander",
      count: 2,
    });
  });

  it("sorts suggestions by set name alphabetically", () => {
    const result = buildSetSuggestions(printings, "commander");
    const names = result.map((s) => s.setName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("matches by set code (case-insensitive)", () => {
    const result = buildSetSuggestions(printings, "BLC");
    expect(result).toEqual([
      { setCode: "BLC", setName: "Bloomburrow Commander", count: 2 },
    ]);
  });

  it("does not match by collector number (collector # is not a set suggestion)", () => {
    // "129" matches a collector number but the dropdown only surfaces sets,
    // so nothing should be suggested.
    expect(buildSetSuggestions(printings, "129")).toEqual([]);
  });

  it("returns one entry per unique set code even when set name is partially shared", () => {
    const result = buildSetSuggestions(printings, "commander");
    const codes = result.map((s) => s.setCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("isExactSingleSetMatch", () => {
  it("returns true when there is exactly one suggestion matching the trimmed, case-folded query", () => {
    const suggestions = [
      { setCode: "BLC", setName: "Bloomburrow Commander", count: 2 },
    ];
    expect(isExactSingleSetMatch(suggestions, "bloomburrow commander")).toBe(
      true,
    );
    expect(isExactSingleSetMatch(suggestions, "  Bloomburrow Commander  ")).toBe(
      true,
    );
  });

  it("returns false when there are multiple suggestions", () => {
    const suggestions = [
      { setCode: "BLC", setName: "Bloomburrow Commander", count: 2 },
      { setCode: "C21", setName: "Commander 2021", count: 1 },
    ];
    expect(isExactSingleSetMatch(suggestions, "commander")).toBe(false);
  });

  it("returns false when the single suggestion is only a partial match", () => {
    const suggestions = [
      { setCode: "BLC", setName: "Bloomburrow Commander", count: 2 },
    ];
    expect(isExactSingleSetMatch(suggestions, "bloom")).toBe(false);
  });

  it("returns false when suggestions are empty", () => {
    expect(isExactSingleSetMatch([], "anything")).toBe(false);
  });
});
