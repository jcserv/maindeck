import { describe, expect, it } from "vitest";
import {
  basicLandTypeCount,
  classifyLandCycle,
  fetchableColors,
  isNonbasicLand,
  type CycleCard,
} from "../cycles";

function card(p: Partial<CycleCard>): CycleCard {
  return {
    name: "Test",
    typeLine: "Land",
    oracleText: null,
    colors: [],
    colorIdentity: [],
    ...p,
  };
}

// Fixtures use current Oracle wording. They double as drift canaries.
const FIXTURES: Record<string, CycleCard> = {
  scaldingTarn: card({
    name: "Scalding Tarn",
    typeLine: "Land",
    oracleText:
      "{T}, Pay 1 life, Sacrifice Scalding Tarn: Search your library for an Island or Mountain card, put it onto the battlefield, then shuffle.",
  }),
  steamVents: card({
    name: "Steam Vents",
    typeLine: "Land — Island Mountain",
    oracleText:
      "({T}: Add {U} or {R}.) As Steam Vents enters, you may pay 2 life. If you don't, it enters tapped.",
  }),
  volcanicIsland: card({
    name: "Volcanic Island",
    typeLine: "Land — Island Mountain",
    oracleText: "({T}: Add {U} or {R}.)",
  }),
  clifftopRetreat: card({
    name: "Clifftop Retreat",
    typeLine: "Land",
    oracleText:
      "Clifftop Retreat enters tapped unless you control a Mountain or a Plains.",
  }),
  seachromeCoast: card({
    name: "Seachrome Coast",
    typeLine: "Land",
    oracleText:
      "Seachrome Coast enters tapped unless you control two or fewer other lands.\n{T}: Add {W} or {U}.",
  }),
  adarkarWastes: card({
    name: "Adarkar Wastes",
    typeLine: "Land",
    oracleText:
      "{T}: Add {C}.\n{T}: Add {W} or {U}. Adarkar Wastes deals 1 damage to you.",
  }),
  canopyVista: card({
    name: "Canopy Vista",
    typeLine: "Land — Forest Plains",
    oracleText:
      "Canopy Vista enters tapped unless you control two or more basic lands.\n{T}: Add {G} or {W}.",
  }),
  dimirAqueduct: card({
    name: "Dimir Aqueduct",
    typeLine: "Land",
    oracleText:
      "Dimir Aqueduct enters tapped.\nWhen Dimir Aqueduct enters, return a land you control to its owner's hand.\n{T}: Add {U}{B}.",
  }),
  savaiTriome: card({
    name: "Savai Triome",
    typeLine: "Land — Plains Mountain Swamp",
    oracleText:
      "Savai Triome enters tapped.\n{T}: Add {W}, {B}, or {R}.\nCycling {3}",
  }),
  celestialColonnade: card({
    name: "Celestial Colonnade",
    typeLine: "Land",
    oracleText:
      "Celestial Colonnade enters tapped.\n{T}: Add {W} or {U}.\n{3}{W}{U}: Celestial Colonnade becomes a 4/4 white and blue Elemental creature with flying and vigilance until end of turn. It's still a land.",
  }),
  basicIsland: card({
    name: "Island",
    typeLine: "Basic Land — Island",
    oracleText: null,
  }),
};

describe("classifyLandCycle", () => {
  const cases: [keyof typeof FIXTURES, string][] = [
    ["scaldingTarn", "fetch"],
    ["steamVents", "shock"],
    ["volcanicIsland", "dual_original"],
    ["clifftopRetreat", "checkland"],
    ["seachromeCoast", "fastland"],
    ["adarkarWastes", "painland"],
    ["canopyVista", "battleland"],
    ["dimirAqueduct", "bounceland"],
    ["savaiTriome", "triome"],
    ["celestialColonnade", "utility_other"],
  ];

  it.each(cases)("classifies %s as %s", (key, expected) => {
    expect(classifyLandCycle(FIXTURES[key]!)).toBe(expected);
  });
});

describe("isNonbasicLand", () => {
  it("is true for nonbasic lands", () => {
    expect(isNonbasicLand(FIXTURES["steamVents"]!)).toBe(true);
    expect(isNonbasicLand(FIXTURES["celestialColonnade"]!)).toBe(true);
  });

  it("is false for basic lands", () => {
    expect(isNonbasicLand(FIXTURES["basicIsland"]!)).toBe(false);
  });

  it("is false for non-lands", () => {
    expect(
      isNonbasicLand(card({ typeLine: "Creature — Elf", oracleText: null })),
    ).toBe(false);
  });
});

describe("fetchableColors", () => {
  it("derives colors from the basic types a fetch names", () => {
    expect(fetchableColors(FIXTURES["scaldingTarn"]!.oracleText).sort()).toEqual(
      ["R", "U"],
    );
  });

  it("derives B/R for a Swamp/Mountain fetch", () => {
    const bloodstainedMire =
      "{T}, Pay 1 life, Sacrifice Bloodstained Mire: Search your library for a Swamp or Mountain card, put it onto the battlefield, then shuffle.";
    expect(fetchableColors(bloodstainedMire).sort()).toEqual(["B", "R"]);
  });

  it("returns [] for a generic basic-land fetch (Prismatic Vista)", () => {
    const prismaticVista =
      "{T}, Pay 1 life, Sacrifice Prismatic Vista: Search your library for a basic land card, put it onto the battlefield, then shuffle.";
    expect(fetchableColors(prismaticVista)).toEqual([]);
  });

  it("returns [] for null oracle text", () => {
    expect(fetchableColors(null)).toEqual([]);
  });
});

describe("basicLandTypeCount", () => {
  it("counts basic subtypes in the type line", () => {
    expect(basicLandTypeCount("Land — Island Mountain")).toBe(2);
    expect(basicLandTypeCount("Land — Plains Mountain Swamp")).toBe(3);
    expect(basicLandTypeCount("Land")).toBe(0);
    expect(basicLandTypeCount(null)).toBe(0);
  });
});
