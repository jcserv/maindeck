import { describe, expect, it } from "vitest";
import { edhrecCardSlug, edhrecCommanderSlug } from "../slug";

describe("edhrecCardSlug", () => {
  it("lowercases and hyphenates a plain name", () => {
    expect(edhrecCardSlug("Norin the Wary")).toBe("norin-the-wary");
  });

  it("drops commas and the apostrophe, collapsing spaces to hyphens", () => {
    expect(edhrecCardSlug("Norin, the Wary")).toBe("norin-the-wary");
    expect(edhrecCardSlug("Kaalia of the Vast")).toBe("kaalia-of-the-vast");
    expect(edhrecCardSlug("Gix, Yawgmoth Praetor")).toBe("gix-yawgmoth-praetor");
  });

  it("drops apostrophes without inserting a hyphen", () => {
    expect(edhrecCardSlug("Urza's Saga")).toBe("urzas-saga");
    expect(edhrecCardSlug("K’rrik, Son of Yawgmoth")).toBe("krrik-son-of-yawgmoth");
  });

  it("strips diacritics", () => {
    expect(edhrecCardSlug("JuZám Djinn")).toBe("juzam-djinn");
  });

  it("uses only the front face of a double-faced name", () => {
    expect(edhrecCardSlug("Esika, God of the Tree // The Prismatic Bridge")).toBe(
      "esika-god-of-the-tree",
    );
  });

  it("trims stray leading/trailing separators", () => {
    expect(edhrecCardSlug("  Norin  ")).toBe("norin");
  });
});

describe("edhrecCommanderSlug", () => {
  it("returns the single-card slug for one commander", () => {
    expect(edhrecCommanderSlug(["Norin, the Wary"])).toBe("norin-the-wary");
  });

  it("joins a partner pair as sorted slugs", () => {
    // EDHREC addresses partner pages by the two slugs joined alphabetically.
    expect(edhrecCommanderSlug(["Tana, the Bloodsower", "Tymna the Weaver"])).toBe(
      "tana-the-bloodsower-tymna-the-weaver",
    );
    // Order of inputs must not matter.
    expect(edhrecCommanderSlug(["Tymna the Weaver", "Tana, the Bloodsower"])).toBe(
      "tana-the-bloodsower-tymna-the-weaver",
    );
  });

  it("ignores empty/blank names", () => {
    expect(edhrecCommanderSlug(["", "  ", "Norin"])).toBe("norin");
  });

  it("returns null when no usable name is present", () => {
    expect(edhrecCommanderSlug([])).toBeNull();
    expect(edhrecCommanderSlug(["", "   "])).toBeNull();
  });
});
