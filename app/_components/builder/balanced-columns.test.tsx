import { describe, expect, it } from "vitest";
import { distributeColumns, type ColumnItem } from "./balanced-columns";
import { sectionWeight } from "./decklist";

function items(weights: number[]): ColumnItem[] {
  return weights.map((weight, i) => ({ key: String(i), weight, node: null }));
}

const keys = (cols: ColumnItem[][]) => cols.map((c) => c.map((i) => i.key));

describe("distributeColumns", () => {
  it("keeps everything in one column when count is 1", () => {
    expect(keys(distributeColumns(items([3, 1, 2]), 1))).toEqual([
      ["0", "1", "2"],
    ]);
  });

  it("balances by weight into the shortest column", () => {
    // weights: 5,1,1,1 over 2 cols -> 5 alone, then 1+1+1 fill the other
    expect(keys(distributeColumns(items([5, 1, 1, 1]), 2))).toEqual([
      ["0"],
      ["1", "2", "3"],
    ]);
  });

  it("preserves source order within each column", () => {
    const cols = distributeColumns(items([2, 2, 2, 2]), 2);
    expect(keys(cols)).toEqual([
      ["0", "2"],
      ["1", "3"],
    ]);
  });

  it("produces empty columns when there are fewer items than columns", () => {
    expect(keys(distributeColumns(items([1]), 3))).toEqual([["0"], [], []]);
  });
});

describe("sectionWeight", () => {
  it("counts one unit per card plus a header", () => {
    expect(sectionWeight(10, false)).toBe(11);
  });

  it("collapses to header-only when collapsed", () => {
    expect(sectionWeight(10, true)).toBe(1);
  });
});
