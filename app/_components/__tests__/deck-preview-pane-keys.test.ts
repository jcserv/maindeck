import { describe, expect, it } from "vitest";
import {
  computeNextRowIndex,
  rowNavDelta,
} from "../deck-preview-pane-keys";

describe("rowNavDelta", () => {
  it("maps next keys to +1", () => {
    expect(rowNavDelta("ArrowRight")).toBe(1);
    expect(rowNavDelta("j")).toBe(1);
  });

  it("maps prev keys to -1", () => {
    expect(rowNavDelta("ArrowLeft")).toBe(-1);
    expect(rowNavDelta("k")).toBe(-1);
  });

  it("returns null for any other key", () => {
    expect(rowNavDelta("Enter")).toBeNull();
    expect(rowNavDelta("a")).toBeNull();
    expect(rowNavDelta("")).toBeNull();
  });
});

describe("computeNextRowIndex", () => {
  it("returns -1 when there are no rows", () => {
    expect(computeNextRowIndex(-1, 0, 1)).toBe(-1);
    expect(computeNextRowIndex(0, 0, -1)).toBe(-1);
  });

  it("falls back to the first row on next when nothing is selected", () => {
    expect(computeNextRowIndex(-1, 5, 1)).toBe(0);
  });

  it("falls back to the last row on prev when nothing is selected", () => {
    expect(computeNextRowIndex(-1, 5, -1)).toBe(4);
  });

  it("wraps from the last row to the first on next", () => {
    expect(computeNextRowIndex(4, 5, 1)).toBe(0);
  });

  it("wraps from the first row to the last on prev", () => {
    expect(computeNextRowIndex(0, 5, -1)).toBe(4);
  });

  it("steps within bounds", () => {
    expect(computeNextRowIndex(2, 5, 1)).toBe(3);
    expect(computeNextRowIndex(2, 5, -1)).toBe(1);
  });
});
