import { parseDeckList } from "@/lib/decklist/parse";
import { Zone } from "@/lib/generated/prisma/enums";

export type ParsedCard = {
  name: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
  zone: Zone;
  category: string | null;
};

export type ParseResult = {
  format: "text" | "arena" | "dek";
  cards: ParsedCard[];
  unmatchedLines: string[];
  warnings: string[];
};

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

// Looks like a card line (starts with a digit) but failed to parse
const LOOKS_LIKE_CARD = /^\d+\s+\S/;

function detectFormat(input: string): "text" | "arena" | "dek" {
  const trimmed = input.trimStart();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
    return "dek";
  }
  if (/^deck\s*$/im.test(input)) {
    return "arena";
  }
  return "text";
}

function parseDekXml(input: string): ParseResult {
  const warnings: string[] = [];
  const cards: ParsedCard[] = [];
  const cardRegex =
    /<Cards[^>]*Quantity="(\d+)"[^>]*Sideboard="(true|false)"[^>]*Name="([^"]+)"[^>]*\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = cardRegex.exec(input)) !== null) {
    const [, quantityStr, sideboard, name] = match;
    if (quantityStr === undefined || name === undefined) continue;
    const quantity = parseInt(quantityStr, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    cards.push({
      name,
      quantity,
      isFoil: false,
      zone: sideboard === "true" ? Zone.SIDEBOARD : Zone.MAINBOARD,
      category: null,
    });
  }

  if (cards.length === 0) {
    warnings.push("DEK file contained no parseable card entries");
  }

  return { format: "dek", cards, unmatchedLines: [], warnings };
}

export function parseImportText(input: string): ParseResult {
  const format = detectFormat(input);

  if (format === "dek") {
    return parseDekXml(input);
  }

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
