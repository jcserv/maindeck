import { createHash } from "node:crypto";
import { Format } from "@/lib/generated/prisma/enums";
import type { MtgjsonDeckFile } from "./mtgjson";

const TYPE_MAP: Record<string, Format> = {
  "Commander Deck": Format.COMMANDER,
  "Brawl Deck": Format.BRAWL,
  "Standard Deck": Format.STANDARD,
  "Challenger Deck": Format.STANDARD,
  "Planeswalker Deck": Format.STANDARD,
  "Modern Deck": Format.MODERN,
  "Pioneer Deck": Format.PIONEER,
  "Legacy Deck": Format.LEGACY,
  "Vintage Deck": Format.VINTAGE,
  "Pauper Deck": Format.PAUPER,
  "Historic Deck": Format.HISTORIC,
  "Alchemy Deck": Format.ALCHEMY,
  "Explorer Deck": Format.EXPLORER,
  "Oathbreaker Deck": Format.OATHBREAKER,
};

// Denylist of mtgjson `type` strings that aren't real preconstructed decks:
// reprint boxes, set checklists, promo bundles, art products. Anything else
// is allowed through (and the card-count floor still catches tiny stragglers).
// New product types default to "let it in" — false positives are easier to
// notice and remove than silently-missing real decks.
const DENIED_TYPES: ReadonlySet<string> = new Set([
  "From the Vault",
  "Foil Set",
  "Box Set",
  "Promo Set",
  "Signature Spellbook",
  "Secret Lair Drop",
  "Land Set",
  "Vanguard",
  "Hero's Path",
  "Spellbook",
  "Commander Collection",
]);

const MIN_DECK_SIZE = 40;

export function mapMtgjsonTypeToFormat(type: string): Format {
  return TYPE_MAP[type] ?? Format.CASUAL;
}

export type PreconRejection =
  | { ok: true }
  | { ok: false; reason: "denied_type" | "below_card_floor"; cardCount: number };

// Filter out mtgjson "decks" that aren't real preconstructed decks.
// Returns a discriminated result so callers can log *why* something was
// skipped — important because the denylist may need updating when WotC
// invents a new product type.
export function classifyPrecon(deck: MtgjsonDeckFile): PreconRejection {
  const cardCount =
    sumCounts(deck.commander) +
    sumCounts(deck.mainBoard) +
    sumCounts(deck.sideBoard);
  if (DENIED_TYPES.has(deck.type)) {
    return { ok: false, reason: "denied_type", cardCount };
  }
  if (cardCount < MIN_DECK_SIZE) {
    return { ok: false, reason: "below_card_floor", cardCount };
  }
  return { ok: true };
}

function sumCounts(cards: MtgjsonDeckFile["mainBoard"]): number {
  let n = 0;
  for (const c of cards) n += c.count;
  return n;
}

export function buildDecklistText(deck: MtgjsonDeckFile): string {
  const lines: string[] = [];

  if (deck.commander.length > 0) {
    lines.push("// Commander");
    for (const c of deck.commander) {
      lines.push(`${c.count} ${c.name}`);
    }
    lines.push("");
  }

  lines.push("// Mainboard");
  for (const c of deck.mainBoard) {
    lines.push(`${c.count} ${c.name}`);
  }

  if (deck.sideBoard.length > 0) {
    lines.push("");
    lines.push("// Sideboard");
    for (const c of deck.sideBoard) {
      lines.push(`${c.count} ${c.name}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function hashDeckContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
