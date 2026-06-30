import { Format, Zone } from "@/lib/generated/prisma/enums";
import type {
  DeckSnapshot,
  LegalityIssue,
  SnapshotCard,
} from "@/lib/deck/mutation/types";
import { isBasicLandCard } from "./shared";
import { COMMANDER_DECK_SIZE, SIXTY_CARD_MIN } from "./constants";

/**
 * Companion deckbuilding restrictions.
 *
 * These conditions come from each card's oracle text (the MTG comprehensive
 * rules), NOT from Scryfall's structured data — Scryfall exposes the
 * `Companion` keyword but not the machine-readable restriction. There is a
 * fixed, closed set of ten companions, so the restrictions are encoded here as
 * predicates keyed by card name. See `docs/agents/domain.md` /
 * `CONTEXT.md` for the sourcing decision.
 */

/** The subset of a card needed to judge a companion restriction. */
type JudgedCard = {
  name: string;
  typeLine: string | null;
  cmc: number | null;
  manaCost: string | null;
  oracleText: string | null;
  quantity: number;
};

type RestrictionContext = { format: Format };

type RestrictionResult = { ok: boolean; reason: string };

type CompanionRestriction = {
  /** Short human-readable summary of the deckbuilding restriction. */
  summary: string;
  check: (cards: JudgedCard[], ctx: RestrictionContext) => RestrictionResult;
};

const OK: RestrictionResult = { ok: true, reason: "" };

const PERMANENT_TYPES = new Set([
  "Artifact",
  "Battle",
  "Creature",
  "Enchantment",
  "Land",
  "Planeswalker",
]);

const CARD_TYPES = [
  "Artifact",
  "Battle",
  "Creature",
  "Enchantment",
  "Instant",
  "Kindred",
  "Land",
  "Planeswalker",
  "Sorcery",
] as const;

function manaValue(card: JudgedCard): number {
  return card.cmc ?? 0;
}

function isLand(typeLine: string | null): boolean {
  return !!typeLine && /\bLand\b/.test(typeLine);
}

function cardTypesOf(typeLine: string | null): string[] {
  if (!typeLine) return [];
  /* c8 ignore next */
  const front = typeLine.split("—")[0] ?? typeLine;
  return CARD_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(front));
}

function isPermanent(typeLine: string | null): boolean {
  return cardTypesOf(typeLine).some((t) => PERMANENT_TYPES.has(t));
}

function creatureSubtypesOf(typeLine: string | null): string[] {
  if (!typeLine || !typeLine.includes("—")) return [];
  /* c8 ignore next */
  const back = typeLine.split("—")[1] ?? "";
  return back
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Tokenise a mana cost like `{2}{G}{G}` into its symbol strings. */
function manaSymbols(manaCost: string | null): string[] {
  if (!manaCost) return [];
  return [...manaCost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
}

/** Generic/variable symbols don't count toward Jegantha's restriction. */
function isGenericSymbol(symbol: string): boolean {
  return /^\d+$/.test(symbol) || /^[XYZ]$/.test(symbol);
}

function hasActivatedAbility(card: JudgedCard): boolean {
  // Basic lands have the intrinsic "{T}: Add ..." mana ability even though
  // their oracle text is empty on Scryfall.
  if (isBasicLandCard(card.typeLine, card.name)) return true;
  const oracle = card.oracleText ?? "";
  if (/:\s/.test(oracle)) return true;
  return /\b(Equip|Crew|Reconfigure)\b/.test(oracle);
}

function formatMinimum(format: Format): number {
  switch (format) {
    case Format.COMMANDER:
    case Format.OATHBREAKER:
      return COMMANDER_DECK_SIZE;
    default:
      return SIXTY_CARD_MIN;
  }
}

const KAHEERA_TYPES = new Set([
  "Cat",
  "Elemental",
  "Nightmare",
  "Dinosaur",
  "Beast",
]);

export const companionRestrictions: Record<string, CompanionRestriction> = {
  "Gyruda, Doom of Depths": {
    summary: "Every card in your deck has an even mana value.",
    check: (cards) => {
      const bad = cards.find((c) => manaValue(c) % 2 !== 0);
      return bad
        ? { ok: false, reason: `${bad.name} has an odd mana value` }
        : OK;
    },
  },
  "Jegantha, the Wellspring": {
    summary: "No card has more than one of the same mana symbol in its cost.",
    check: (cards) => {
      for (const c of cards) {
        const counts = new Map<string, number>();
        for (const sym of manaSymbols(c.manaCost)) {
          if (isGenericSymbol(sym)) continue;
          counts.set(sym, (counts.get(sym) ?? 0) + 1);
        }
        if ([...counts.values()].some((n) => n > 1)) {
          return { ok: false, reason: `${c.name} repeats a mana symbol` };
        }
      }
      return OK;
    },
  },
  "Kaheera, the Orphanguard": {
    summary:
      "Each creature card is a Cat, Elemental, Nightmare, Dinosaur, and/or Beast.",
    check: (cards) => {
      for (const c of cards) {
        if (!cardTypesOf(c.typeLine).includes("Creature")) continue;
        const subs = creatureSubtypesOf(c.typeLine);
        const hasChangeling = /\bChangeling\b/i.test(c.oracleText ?? "");
        if (!hasChangeling && !subs.some((s) => KAHEERA_TYPES.has(s))) {
          return {
            ok: false,
            reason: `${c.name} is a creature outside the allowed types`,
          };
        }
      }
      return OK;
    },
  },
  "Keruga, the Macrosage": {
    summary: "Each nonland card has mana value 3 or greater.",
    check: (cards) => {
      const bad = cards.find((c) => !isLand(c.typeLine) && manaValue(c) < 3);
      return bad
        ? { ok: false, reason: `${bad.name} has mana value less than 3` }
        : OK;
    },
  },
  "Lurrus of the Dream-Den": {
    summary: "Each permanent card has mana value 2 or less.",
    check: (cards) => {
      const bad = cards.find(
        (c) => isPermanent(c.typeLine) && manaValue(c) > 2,
      );
      return bad
        ? {
            ok: false,
            reason: `${bad.name} is a permanent with mana value greater than 2`,
          }
        : OK;
    },
  },
  "Lutri, the Spellchaser": {
    summary: "No two cards in your deck have the same name (singleton).",
    check: (cards) => {
      const counts = new Map<string, number>();
      for (const c of cards) {
        if (isBasicLandCard(c.typeLine, c.name)) continue;
        counts.set(c.name, (counts.get(c.name) ?? 0) + c.quantity);
      }
      for (const [name, n] of counts) {
        if (n > 1) {
          return { ok: false, reason: `${name} appears more than once` };
        }
      }
      return OK;
    },
  },
  "Obosh, the Preypiercer": {
    summary: "Each card in your deck has an odd mana value.",
    check: (cards) => {
      const bad = cards.find(
        (c) => !isLand(c.typeLine) && manaValue(c) % 2 === 0,
      );
      return bad
        ? { ok: false, reason: `${bad.name} has an even mana value` }
        : OK;
    },
  },
  "Umori, the Collector": {
    summary: "Each nonland card shares a card type.",
    check: (cards) => {
      const nonland = cards.filter((c) => !isLand(c.typeLine));
      if (nonland.length === 0) return OK;
      const shared = new Set<string>(
        cardTypesOf(nonland[0]!.typeLine).filter((t) => t !== "Land"),
      );
      for (const c of nonland.slice(1)) {
        const types = new Set(cardTypesOf(c.typeLine));
        for (const t of [...shared]) {
          if (!types.has(t)) shared.delete(t);
        }
        if (shared.size === 0) break;
      }
      return shared.size === 0
        ? { ok: false, reason: "nonland cards do not all share a card type" }
        : OK;
    },
  },
  "Yorion, Sky Nomad": {
    summary: "Your deck has at least 20 cards above the format minimum.",
    check: (cards, ctx) => {
      const total = cards.reduce((s, c) => s + c.quantity, 0);
      const needed = formatMinimum(ctx.format) + 20;
      return total < needed
        ? {
            ok: false,
            reason: `deck has ${total} cards, needs at least ${needed}`,
          }
        : OK;
    },
  },
  "Zirda, the Dawnwaker": {
    summary: "Each permanent card has an activated ability.",
    check: (cards) => {
      const bad = cards.find(
        (c) => isPermanent(c.typeLine) && !hasActivatedAbility(c),
      );
      return bad
        ? {
            ok: false,
            reason: `${bad.name} is a permanent without an activated ability`,
          }
        : OK;
    },
  },
};

/** Names of every card maindeck recognises as a companion. */
export const COMPANION_NAMES: ReadonlySet<string> = new Set(
  Object.keys(companionRestrictions),
);

function toJudged(c: SnapshotCard): JudgedCard {
  return {
    name: c.cardName,
    typeLine: c.typeLine,
    cmc: c.cmc ?? null,
    manaCost: c.manaCost ?? null,
    oracleText: c.oracleText ?? null,
    quantity: c.quantity,
  };
}

/**
 * Universal rule: for each card in the COMPANION zone, validate its
 * deckbuilding restriction against the deck's mainboard + commander cards.
 * Cards in the companion zone that aren't recognised companions are flagged.
 */
export function companionRule(snap: DeckSnapshot): LegalityIssue[] {
  const companions = snap.cards.filter((c) => c.zone === Zone.COMPANION);
  if (companions.length === 0) return [];

  const judged = snap.cards
    .filter((c) => c.zone === Zone.MAINBOARD || c.zone === Zone.COMMANDER)
    .map(toJudged);

  const issues: LegalityIssue[] = [];
  if (companions.length > 1) {
    issues.push({
      kind: "companion_violation",
      cardName: companions[companions.length - 1]!.cardName,
      reason: "a deck may have only one companion",
    });
  }
  for (const comp of companions) {
    const restriction = companionRestrictions[comp.cardName];
    if (!restriction) {
      issues.push({
        kind: "companion_violation",
        cardName: comp.cardName,
        reason: "not a companion",
      });
      continue;
    }
    const result = restriction.check(judged, { format: snap.format });
    if (!result.ok) {
      issues.push({
        kind: "companion_violation",
        cardName: comp.cardName,
        reason: result.reason,
      });
    }
  }
  return issues;
}
