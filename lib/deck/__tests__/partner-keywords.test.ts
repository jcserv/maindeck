import { describe, expect, it } from "vitest";
import { canHavePartner } from "../partner-keywords";

describe("canHavePartner — keyword matching", () => {
  it.each([
    ["Partner"],
    ["Doctor's companion"],
    // Scryfall stores "Choose a background" with a lowercase b
    ["Choose a background"],
    // Rowan, Scholar of Sparks / Will, Scholar of Frost
    ["Friends forever"],
  ])("returns true for keyword %s", (keyword) => {
    expect(canHavePartner([keyword])).toBe(true);
  });

  it("returns false for non-partner keyword", () => {
    expect(canHavePartner(["Flying"])).toBe(false);
  });

  it("returns false for empty keywords and no typeLine", () => {
    expect(canHavePartner([])).toBe(false);
  });

  it("returns false for 'Partner with [Name]' — named pairing is not freely combinable", () => {
    // "Partner with X" cards can only pair with their named partner, not any commander.
    // Named-pairing validation is tracked as a follow-up ticket.
    expect(canHavePartner(["Partner with Rograkh, Son of Rohgahh"])).toBe(false);
    expect(canHavePartner(["Partner with Akiri, Line-Slinger"])).toBe(false);
  });
});

describe("canHavePartner — Background enchantment (typeLine check)", () => {
  it("returns true for a Background enchantment with no keywords", () => {
    // Scryfall stores Background enchantments with keywords: [] — no keyword at all
    expect(canHavePartner([], "Legendary Enchantment — Background")).toBe(true);
  });

  it("returns true when card has both Choose a background keyword and Background typeLine", () => {
    expect(
      canHavePartner(
        ["Choose a background"],
        "Legendary Enchantment — Background",
      ),
    ).toBe(true);
  });

  it("returns false for non-Background typeLine with no keywords", () => {
    expect(canHavePartner([], "Legendary Creature — Human Scout")).toBe(false);
  });

  it("returns false for null typeLine with no keywords", () => {
    expect(canHavePartner([], null)).toBe(false);
  });
});
