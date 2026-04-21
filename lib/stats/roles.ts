import type { DeckCardWithRelations } from "./compute";

export type DeckRole =
  | "Ramp"
  | "Draw"
  | "Removal"
  | "Protection"
  | "Creatures"
  | "Lands"
  | "Other";

export const DECK_ROLES: readonly DeckRole[] = [
  "Ramp",
  "Draw",
  "Removal",
  "Protection",
  "Creatures",
  "Lands",
  "Other",
] as const;

const PATTERNS: Record<Exclude<DeckRole, "Creatures" | "Lands" | "Other">, RegExp[]> = {
  Ramp: [
    /search your library for (?:a |an |up to \w+ )?(?:basic )?(?:land|forest|plains|island|swamp|mountain)/i,
    /add \{[wubrgc]\}|\badd one mana\b/i,
    /treasure token/i,
    /put [a-z ]*land[a-z ]* onto the battlefield/i,
  ],
  Draw: [
    /draw (?:a|two|three|four|five|that many|x) cards?/i,
    /scry \d/i,
    /\blook at the top \d? cards?/i,
  ],
  Removal: [
    /destroy target/i,
    /exile target/i,
    /counter target/i,
    /deals \d+ damage to (?:any target|target (?:creature|planeswalker|player))/i,
    /return target [^.]* to (?:its|their) owner's hand/i,
  ],
  Protection: [
    /hexproof|indestructible|ward \{|shroud/i,
    /prevent all damage/i,
    /regenerate target/i,
    /protection from/i,
  ],
};

function isLand(typeLine: string | null | undefined): boolean {
  return !!typeLine && /land/i.test(typeLine);
}

function isCreature(typeLine: string | null | undefined): boolean {
  return !!typeLine && /creature/i.test(typeLine);
}

export function classifyRole(card: {
  typeLine: string | null | undefined;
  oracleText: string | null | undefined;
}): DeckRole {
  if (isLand(card.typeLine)) return "Lands";
  const oracle = card.oracleText ?? "";

  // Non-land, non-creature utility — prioritize function first
  for (const [role, patterns] of Object.entries(PATTERNS) as [
    Exclude<DeckRole, "Creatures" | "Lands" | "Other">,
    RegExp[],
  ][]) {
    if (patterns.some((p) => p.test(oracle))) return role;
  }

  if (isCreature(card.typeLine)) return "Creatures";
  return "Other";
}

export function computeRoleDistribution(
  cards: DeckCardWithRelations[],
): Record<DeckRole, number> {
  const dist: Record<DeckRole, number> = {
    Ramp: 0,
    Draw: 0,
    Removal: 0,
    Protection: 0,
    Creatures: 0,
    Lands: 0,
    Other: 0,
  };
  for (const dc of cards) {
    if (dc.zone === "SIDEBOARD" || dc.zone === "CONSIDERING") continue;
    const role = classifyRole({
      typeLine: dc.card.typeLine,
      oracleText: dc.card.oracleText,
    });
    dist[role] += dc.quantity;
  }
  return dist;
}
