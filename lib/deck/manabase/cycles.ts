/**
 * Land-cycle classification for the "Add lands" flow. Pure — operates on a
 * minimal card shape (mirrors `ClassifiableCard` in `category-autogen.ts`) so
 * it has no dependency on generated Prisma output and is trivially unit-testable.
 *
 * The regexes target *current* Oracle wording. The per-cycle test fixtures are
 * the canary: if a future Scryfall sync changes wording, those tests surface
 * the drift before it ships.
 */

import { isBasicLand } from "@/lib/deck/zone-view";

export interface CycleCard {
  name: string;
  typeLine: string | null;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
}

export type LandCycleId =
  | "fetch"
  | "shock"
  | "dual_original"
  | "checkland"
  | "fastland"
  | "painland"
  | "battleland"
  | "bounceland"
  | "triome"
  | "bond"
  | "scry"
  | "slowland"
  | "filter"
  | "gainland"
  | "revealland"
  | "manland"
  | "horizon";

interface LandCycle {
  id: LandCycleId;
  label: string;
  /** Display order in the dialog (Basics render first, outside this list). */
  order: number;
  /** Standalone matcher for this cycle. */
  predicate: (c: CycleCard) => boolean;
}

const BASIC_SUBTYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

/** Count distinct basic land subtypes named in a type line (Tundra → 2). */
export function basicLandTypeCount(typeLine: string | null): number {
  if (!typeLine) return 0;
  let count = 0;
  for (const subtype of BASIC_SUBTYPES) {
    if (new RegExp(`\\b${subtype}\\b`).test(typeLine)) count++;
  }
  return count;
}

// Compiled once at module load. See file header re: Oracle-wording drift.
const RE_FETCH = /pay 1 life, sacrifice [^:.]*: search your library/i;
const RE_SHOCK = /you may pay 2 life\. if you don'?t, it enters tapped/i;
const RE_CHECK =
  /enters tapped unless you control a[n]? (plains|island|swamp|mountain|forest)/i;
const RE_FAST = /enters tapped unless you control two or fewer other lands/i;
const RE_BATTLE = /enters tapped unless you control two or more basic lands/i;
const RE_PAIN_DAMAGE = /deals 1 damage to you/i;
const RE_PAIN_ADD = /add \{[wubrg]\} or \{[wubrg]\}/i;
const RE_BOUNCE =
  /when [^.]* enters, return a land you control to its owner'?s hand/i;
// Original dual lands (Tundra, Volcanic Island, …) carry two basic subtypes and
// no drawback text. Anything with a tap/pay/damage clause is a different cycle.
const RE_DUAL_DISQUALIFY = /enters tapped|pay \d|damage to you|sacrifice/i;
const RE_BOND    = /enters tapped unless you have two or more opponents/i;
const RE_SCRY    = /when [^.]* enters, scry 1/i;
const RE_SLOW    = /enters tapped unless you control two or more other lands/i;
const RE_FILTER  = /\{1\},?\s*\{t\}: add \{[wubrg]\}\{[wubrg]\}/i;
const RE_GAIN    = /when [^.]* enters, you gain 1 life/i;
const RE_REVEAL  = /enters tapped unless you reveal a [^.]* card from your hand/i;
const RE_MANLAND = /it'?s still a land/i;
const RE_HORIZON = /pay 1 life, sacrifice [^:]+: draw a card/i;

function oracle(c: CycleCard): string {
  return c.oracleText ?? "";
}

const PREDICATES: Record<LandCycleId, (c: CycleCard) => boolean> = {
  fetch: (c) => RE_FETCH.test(oracle(c)),
  shock: (c) =>
    basicLandTypeCount(c.typeLine) === 2 && RE_SHOCK.test(oracle(c)),
  checkland: (c) => RE_CHECK.test(oracle(c)),
  fastland: (c) => RE_FAST.test(oracle(c)),
  battleland: (c) => RE_BATTLE.test(oracle(c)),
  painland: (c) =>
    RE_PAIN_DAMAGE.test(oracle(c)) && RE_PAIN_ADD.test(oracle(c)),
  bounceland: (c) => RE_BOUNCE.test(oracle(c)),
  triome: (c) => basicLandTypeCount(c.typeLine) === 3,
  dual_original: (c) =>
    basicLandTypeCount(c.typeLine) === 2 &&
    !RE_DUAL_DISQUALIFY.test(oracle(c)),
  bond:       (c) => RE_BOND.test(oracle(c)),
  scry:       (c) => RE_SCRY.test(oracle(c)),
  slowland:   (c) => RE_SLOW.test(oracle(c)),
  filter:     (c) => RE_FILTER.test(oracle(c)),
  gainland:   (c) => RE_GAIN.test(oracle(c)),
  revealland: (c) => RE_REVEAL.test(oracle(c)),
  manland:    (c) => RE_MANLAND.test(oracle(c)) && c.colorIdentity.length >= 2,
  horizon:    (c) => RE_HORIZON.test(oracle(c)),
};

export const LAND_CYCLES: readonly LandCycle[] = [
  { id: "fetch", label: "Fetch lands", order: 1, predicate: PREDICATES.fetch },
  { id: "shock", label: "Shock lands", order: 2, predicate: PREDICATES.shock },
  {
    id: "dual_original",
    label: "Dual lands",
    order: 3,
    predicate: PREDICATES.dual_original,
  },
  {
    id: "checkland",
    label: "Check lands",
    order: 4,
    predicate: PREDICATES.checkland,
  },
  {
    id: "fastland",
    label: "Fast lands",
    order: 5,
    predicate: PREDICATES.fastland,
  },
  {
    id: "painland",
    label: "Pain lands",
    order: 6,
    predicate: PREDICATES.painland,
  },
  {
    id: "battleland",
    label: "Battle lands",
    order: 7,
    predicate: PREDICATES.battleland,
  },
  {
    id: "bounceland",
    label: "Bounce lands",
    order: 8,
    predicate: PREDICATES.bounceland,
  },
  { id: "triome", label: "Triomes", order: 9, predicate: PREDICATES.triome },
  { id: "bond",       label: "Bond lands",   order: 10, predicate: PREDICATES.bond },
  { id: "scry",       label: "Scry lands",   order: 11, predicate: PREDICATES.scry },
  { id: "slowland",   label: "Slow lands",   order: 12, predicate: PREDICATES.slowland },
  { id: "filter",     label: "Filter lands", order: 13, predicate: PREDICATES.filter },
  { id: "gainland",   label: "Gain lands",   order: 14, predicate: PREDICATES.gainland },
  { id: "revealland", label: "Reveal lands", order: 15, predicate: PREDICATES.revealland },
  { id: "manland",    label: "Creature lands", order: 16, predicate: PREDICATES.manland },
  { id: "horizon",    label: "Horizon lands", order: 17, predicate: PREDICATES.horizon },
];

// Most-specific-first classification priority. Distinct from display `order`:
// taplands that share "enters tapped" wording must be tested against their
// specific clauses before the broad two-subtype dual gate.
const CLASSIFY_ORDER: LandCycleId[] = [
  "fetch",
  "horizon",
  "bond",
  "shock",
  "revealland",
  "checkland",
  "fastland",
  "slowland",
  "battleland",
  "filter",
  "gainland",
  "scry",
  "bounceland",
  "manland",
  "painland",
  "triome",
  "dual_original",
];

const BASIC_TYPE_TO_COLOR: Record<string, string> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
};

/**
 * The colors a fetch land can produce, derived from the basic land subtypes it
 * names in its search clause (fetches have an empty color identity, so this is
 * the only signal). A generic fetch ("search your library for a basic land
 * card") names no subtype and returns `[]` — treat that as on-color anywhere.
 */
export function fetchableColors(oracleText: string | null): string[] {
  if (!oracleText) return [];
  const colors = new Set<string>();
  for (const [subtype, color] of Object.entries(BASIC_TYPE_TO_COLOR)) {
    if (new RegExp(`\\b${subtype}\\b`).test(oracleText)) colors.add(color);
  }
  return [...colors];
}

/** True when the card is a land but not a basic land. */
export function isNonbasicLand(c: CycleCard): boolean {
  return (
    !!c.typeLine && /\bLand\b/.test(c.typeLine) && !isBasicLand(c.typeLine)
  );
}

/**
 * Classify a nonbasic land into its cycle, most-specific-first.
 * Returns null for lands that match no known cycle.
 */
export function classifyLandCycle(c: CycleCard): LandCycleId | null {
  for (const id of CLASSIFY_ORDER) {
    if (PREDICATES[id](c)) return id;
  }
  return null;
}
