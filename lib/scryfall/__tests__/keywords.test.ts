import { describe, expect, it } from "vitest";
import { filterKeywords } from "../keywords";

describe("filterKeywords", () => {
  it("returns [] for undefined input", () => {
    expect(filterKeywords(undefined)).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(filterKeywords([])).toEqual([]);
  });

  it("keeps only known keywords", () => {
    expect(filterKeywords(["Flying", "Bogus", "Trample"])).toEqual([
      "Flying",
      "Trample",
    ]);
  });

  it("is case sensitive — drops lowercased names", () => {
    expect(filterKeywords(["flying"])).toEqual([]);
  });

  it("returns [] when all keywords unknown", () => {
    expect(filterKeywords(["Xyzzy", "Plugh"])).toEqual([]);
  });
});
