import { parseDeckList } from "@/lib/decklist/parse";
import { Zone } from "@/lib/generated/prisma/enums";
import type { ParsedCard, ParseResult } from "../parse";
import type { DeckCardWithDetails } from "./types";

type SectionMarker = {
  pattern: RegExp;
  zone: Zone;
};

const SECTION_MARKERS: SectionMarker[] = [
  { pattern: /^\/\/\s*mainboard\s*$/i, zone: Zone.MAINBOARD },
  { pattern: /^mainboard\s*:?\s*$/i, zone: Zone.MAINBOARD },
  { pattern: /^deck\s*$/i, zone: Zone.MAINBOARD },
  { pattern: /^\/\/\s*sideboard\s*$/i, zone: Zone.SIDEBOARD },
  { pattern: /^sideboard\s*:?\s*$/i, zone: Zone.SIDEBOARD },
  { pattern: /^\/\/\s*considering\s*$/i, zone: Zone.CONSIDERING },
  { pattern: /^considering\s*:?\s*$/i, zone: Zone.CONSIDERING },
  { pattern: /^maybeboard\s*:?\s*$/i, zone: Zone.CONSIDERING },
  { pattern: /^\/\/\s*commander\s*$/i, zone: Zone.COMMANDER },
  { pattern: /^commander\s*:?\s*$/i, zone: Zone.COMMANDER },
];

const LOOKS_LIKE_CARD = /^\d+\s+\S/;

export function parseLineBased(
  input: string,
  format: "text" | "arena",
): ParseResult {
  const lines = input.split("\n");
  const cards: ParsedCard[] = [];
  const unmatchedLines: string[] = [];
  const warnings: string[] = [];
  let currentZone: Zone = Zone.MAINBOARD;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const marker = SECTION_MARKERS.find((m) => m.pattern.test(line));
    if (marker) {
      currentZone = marker.zone;
      continue;
    }

    if (/^\/\//.test(line) && !LOOKS_LIKE_CARD.test(line)) {
      continue;
    }

    const parsed = parseDeckList(line);
    if (parsed.length > 0) {
      for (const card of parsed) {
        cards.push({ ...card, zone: currentZone, category: null });
      }
      continue;
    }

    if (LOOKS_LIKE_CARD.test(line)) {
      unmatchedLines.push(line);
    }
  }

  return { format, cards, unmatchedLines, warnings };
}

export const ZONE_ORDER: Zone[] = [
  "COMMANDER",
  "MAINBOARD",
  "SIDEBOARD",
  "CONSIDERING",
];

export const ZONE_LABEL: Record<Zone, string> = {
  MAINBOARD: "Mainboard",
  SIDEBOARD: "Sideboard",
  CONSIDERING: "Considering",
  COMMANDER: "Commander",
};

export function groupByZone(
  cards: DeckCardWithDetails[],
): Map<Zone, DeckCardWithDetails[]> {
  const map = new Map<Zone, DeckCardWithDetails[]>();
  for (const dc of cards) {
    const list = map.get(dc.zone) ?? [];
    list.push(dc);
    map.set(dc.zone, list);
  }
  return map;
}

export function groupBySubcategory(
  cards: DeckCardWithDetails[],
  categories: { name: string; sortOrder: number }[],
): {
  ordered: string[];
  grouped: Map<string, DeckCardWithDetails[]>;
  hasAny: boolean;
} {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const grouped = new Map<string, DeckCardWithDetails[]>();
  const ordered: string[] = [];

  for (const cat of sorted) {
    grouped.set(cat.name, []);
    ordered.push(cat.name);
  }
  const uncategorizedKey = "";
  grouped.set(uncategorizedKey, []);

  let hasAny = false;
  for (const dc of cards) {
    const key = dc.category ?? uncategorizedKey;
    if (dc.category) hasAny = true;
    if (!grouped.has(key)) {
      grouped.set(key, []);
      ordered.push(key);
    }
    grouped.get(key)!.push(dc);
  }

  ordered.push(uncategorizedKey);
  return { ordered, grouped, hasAny };
}
