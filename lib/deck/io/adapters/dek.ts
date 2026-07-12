import { Zone } from "@/lib/generated/prisma/enums";
import { MAX_CARD_QTY } from "../consts";
import type { ParsedCard, ParsedDecklist } from "../parse";
import type { DecklistParser } from "./types";

function detect(input: string): number {
  const trimmed = input.trimStart();
  if (trimmed.startsWith("<?xml")) return 1;
  if (trimmed.startsWith("<")) return 0.95;
  return 0;
}

function parse(input: string): ParsedDecklist {
  const warnings: string[] = [];
  const cards: ParsedCard[] = [];
  const cardRegex =
    /<Cards[^>]*Quantity="(\d+)"[^>]*Sideboard="(true|false)"[^>]*Name="([^"]+)"[^>]*\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = cardRegex.exec(input)) !== null) {
    const [, quantityStr, sideboard, name] = match;
    /* c8 ignore next */
    if (quantityStr === undefined || name === undefined) continue;
    const quantity = parseInt(quantityStr, 10);
    /* c8 ignore next */
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_CARD_QTY) continue;
    cards.push({
      name,
      quantity,
      isFoil: false,
      zone: sideboard === "true" ? Zone.SIDEBOARD : Zone.MAINBOARD,
      categories: [],
    });
  }

  if (cards.length === 0) {
    warnings.push("DEK file contained no parseable card entries");
  }

  return { format: "dek", cards, unmatchedLines: [], warnings };
}

export const dekAdapter: DecklistParser = {
  id: "dek",
  detect,
  parse,
};
