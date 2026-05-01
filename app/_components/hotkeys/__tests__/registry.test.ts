import { describe, expect, it } from "vitest";

import { partitionShortcuts } from "../registry";

const DECK_EDITOR_GROUPS = new Set([
  "Deck row",
  "Move card menu",
  "Deck actions menu",
  "Printing picker",
  "Bulk edit dialog",
]);

describe("partitionShortcuts", () => {
  it("puts deck-editor groups in `other` when not in editor", () => {
    const { relevant, other } = partitionShortcuts("", { inDeckEditor: false });
    expect(relevant.every((e) => !DECK_EDITOR_GROUPS.has(e.group))).toBe(true);
    expect(other.length).toBeGreaterThan(0);
    expect(other.every((e) => DECK_EDITOR_GROUPS.has(e.group))).toBe(true);
  });

  it("puts deck-editor groups in `relevant` and the rest in `other` when in editor", () => {
    const { relevant, other } = partitionShortcuts("", { inDeckEditor: true });
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant.every((e) => DECK_EDITOR_GROUPS.has(e.group))).toBe(true);
    expect(other.length).toBeGreaterThan(0);
    expect(other.every((e) => !DECK_EDITOR_GROUPS.has(e.group))).toBe(true);
  });

  it("applies the text filter to both buckets", () => {
    const { relevant, other } = partitionShortcuts("mainboard", {
      inDeckEditor: false,
    });
    const all = [...relevant, ...other];
    expect(all.length).toBeGreaterThan(0);
    for (const entry of all) {
      const haystack =
        `${entry.label} ${entry.group} ${entry.keys.join(" ")}`.toLowerCase();
      expect(haystack).toContain("mainboard");
    }
    expect(other.length).toBeGreaterThan(0);
    expect(relevant.length).toBe(0);
  });

  it("keeps Global, Navigation, and User menu relevant when not in editor", () => {
    const { relevant } = partitionShortcuts("", { inDeckEditor: false });
    const groups = new Set(relevant.map((e) => e.group));
    expect(groups.has("Global")).toBe(true);
    expect(groups.has("Navigation")).toBe(true);
    expect(groups.has("User menu")).toBe(true);
  });
});
