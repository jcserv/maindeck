import { describe, expect, it } from "vitest";
import { CardType, getMainType } from "../types-card";

describe("getMainType", () => {
  it("returns Unknown for undefined", () => {
    expect(getMainType(undefined)).toBe(CardType.Unknown);
  });

  it("returns Unknown for empty string", () => {
    expect(getMainType("")).toBe(CardType.Unknown);
  });

  it("maps old-frame 'Enchant Creature' to Enchantment", () => {
    expect(getMainType("Enchant Creature")).toBe(CardType.Enchantment);
  });

  it("maps Planeswalker", () => {
    expect(getMainType("Legendary Planeswalker — Jace")).toBe(
      CardType.Planeswalker,
    );
  });

  it("maps Battle", () => {
    expect(getMainType("Legendary Battle — Siege")).toBe(CardType.Battle);
  });

  it("maps basic Land", () => {
    expect(getMainType("Basic Land — Forest")).toBe(CardType.Land);
  });

  it("maps Creature", () => {
    expect(getMainType("Creature — Human Wizard")).toBe(CardType.Creature);
  });

  it("Artifact Creature resolves to Creature (ordering guard)", () => {
    expect(getMainType("Artifact Creature — Golem")).toBe(CardType.Creature);
  });

  it("maps Artifact", () => {
    expect(getMainType("Artifact — Equipment")).toBe(CardType.Artifact);
  });

  it("maps Enchantment", () => {
    expect(getMainType("Enchantment — Aura")).toBe(CardType.Enchantment);
  });

  it("maps Sorcery", () => {
    expect(getMainType("Sorcery")).toBe(CardType.Sorcery);
  });

  it("maps Instant", () => {
    expect(getMainType("Instant")).toBe(CardType.Instant);
  });

  it("returns Unknown for unrecognized type line", () => {
    expect(getMainType("Token Dragon")).toBe(CardType.Unknown);
  });

  it("MDFC uses front face only", () => {
    expect(getMainType("Creature — Wizard // Land — Forest")).toBe(
      CardType.Creature,
    );
  });
});
