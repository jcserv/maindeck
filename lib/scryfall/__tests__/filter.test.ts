import { describe, expect, it } from "vitest";
import { filterCard } from "../filter";
import type { ScryfallCard } from "../types";

function card(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: "x",
    lang: "en",
    layout: "normal",
    games: ["paper"],
    name: "Test",
    set: "tst",
    set_name: "Test Set",
    collector_number: "1",
    ...overrides,
  };
}

describe("filterCard", () => {
  it("rejects non-English cards", () => {
    expect(filterCard(card({ lang: "ja" }))).toBe(false);
  });

  it.each([
    "token",
    "double_faced_token",
    "emblem",
    "planar",
    "scheme",
    "vanguard",
    "art_series",
  ] as const)("rejects denied layout %s", (layout) => {
    expect(filterCard(card({ layout }))).toBe(false);
  });

  it.each([
    "normal",
    "adventure",
    "battle",
    "case",
    "class",
    "flip",
    "leveler",
    "meld",
    "modal_dfc",
    "mutate",
    "prototype",
    "reversible_card",
    "saga",
    "split",
    "transform",
    // Future layout Scryfall hasn't shipped yet — denylist must let it through.
    "some_brand_new_layout",
  ] as const)("accepts layout %s", (layout) => {
    expect(filterCard(card({ layout }))).toBe(true);
  });

  it("rejects when games is missing", () => {
    expect(
      filterCard(card({ games: undefined as unknown as string[] })),
    ).toBe(false);
  });

  it("rejects when games lacks paper", () => {
    expect(filterCard(card({ games: ["mtgo", "arena"] }))).toBe(false);
  });

  it("accepts happy-path card", () => {
    expect(filterCard(card())).toBe(true);
  });
});
