import { afterEach, describe, expect, it } from "vitest";
import {
  computeNextRowIndex,
  isFocusInRow,
  isTextInputTarget,
  resolveCurrentRowIndex,
  rowNavDelta,
} from "./deck-preview-pane-keys";

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

describe("isTextInputTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false for null", () => {
    expect(isTextInputTarget(null)).toBe(false);
  });

  it("returns false for non-HTMLElement event targets", () => {
    expect(isTextInputTarget(document)).toBe(false);
  });

  it("returns true for INPUT", () => {
    expect(isTextInputTarget(document.createElement("input"))).toBe(true);
  });

  it("returns true for TEXTAREA", () => {
    expect(isTextInputTarget(document.createElement("textarea"))).toBe(true);
  });

  it("returns truthy for contenteditable elements", () => {
    // jsdom doesn't compute the inherited `isContentEditable` getter, so
    // pin it directly to exercise the branch.
    const el = document.createElement("div");
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isTextInputTarget(el)).toBeTruthy();
  });

  it("returns falsy for plain divs", () => {
    expect(isTextInputTarget(document.createElement("div"))).toBeFalsy();
  });
});

describe("isFocusInRow", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false when no element is focused", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    expect(isFocusInRow()).toBe(false);
  });

  it("returns true when focus is on a row", () => {
    const row = document.createElement("button");
    row.setAttribute("data-deck-row", "");
    document.body.appendChild(row);
    row.focus();
    expect(isFocusInRow()).toBe(true);
  });

  it("returns true when focus is inside a row descendant", () => {
    const row = document.createElement("div");
    row.setAttribute("data-deck-row", "");
    const child = document.createElement("button");
    row.appendChild(child);
    document.body.appendChild(row);
    child.focus();
    expect(isFocusInRow()).toBe(true);
  });

  it("returns false when focus is outside any row", () => {
    const stray = document.createElement("button");
    document.body.appendChild(stray);
    stray.focus();
    expect(isFocusInRow()).toBe(false);
  });
});

describe("resolveCurrentRowIndex", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function makeRows(n: number): HTMLElement[] {
    const rows: HTMLElement[] = [];
    for (let i = 0; i < n; i += 1) {
      const r = document.createElement("button");
      r.setAttribute("data-deck-row", String(i));
      document.body.appendChild(r);
      rows.push(r);
    }
    return rows;
  }

  it("returns the index of the focused row", () => {
    const rows = makeRows(3);
    rows[1]!.focus();
    expect(resolveCurrentRowIndex(rows)).toBe(1);
  });

  it("returns the index of the row containing focus", () => {
    const rows = makeRows(2);
    const child = document.createElement("button");
    rows[1]!.appendChild(child);
    child.focus();
    expect(resolveCurrentRowIndex(rows)).toBe(1);
  });

  it("falls back to a hovered row when focus is elsewhere", () => {
    const rows = makeRows(2);
    // jsdom doesn't simulate :hover; stub querySelector to return the first
    // row when the selector contains :hover so we exercise the hover branch.
    const original = document.querySelector.bind(document);
    document.querySelector = ((sel: string) =>
      sel.includes(":hover") ? rows[0]! : original(sel)) as typeof document.querySelector;
    try {
      const stray = document.createElement("button");
      document.body.appendChild(stray);
      stray.focus();
      expect(resolveCurrentRowIndex(rows)).toBe(0);
    } finally {
      document.querySelector = original;
    }
  });

  it("returns -1 when nothing is focused or hovered", () => {
    const rows = makeRows(2);
    void rows;
    (document.activeElement as HTMLElement | null)?.blur();
    expect(resolveCurrentRowIndex(rows)).toBe(-1);
  });
});
