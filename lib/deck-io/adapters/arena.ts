import type { Zone } from "@/lib/generated/prisma/enums";
import type { ParseResult } from "../parse";
import { groupByZone, parseLineBased } from "./_shared";
import type { DeckCardWithDetails, DeckWithCards, DecklistAdapter } from "./types";

function detect(input: string): number {
  const trimmed = input.trimStart();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) return 0;
  if (/^deck\s*$/im.test(input)) return 0.9;
  return 0;
}

function parse(input: string): ParseResult {
  return parseLineBased(input, "arena");
}

function lineFor(dc: DeckCardWithDetails): string {
  if (dc.printing) {
    return `${dc.quantity} ${dc.card.name} (${dc.printing.setCode.toUpperCase()}) ${dc.printing.collectorNumber}`;
  }
  return `${dc.quantity} ${dc.card.name}`;
}

function serialize(deck: DeckWithCards): string {
  const byZone = groupByZone(deck.cards);
  const lines: string[] = [];
  const mainLines: string[] = [];
  const sideLines: string[] = [];

  // Arena treats Deck = MAINBOARD + COMMANDER (flattened), Sideboard = SIDEBOARD,
  // and ignores subcategories. Considering is not representable in Arena.
  const deckZones: Zone[] = ["COMMANDER", "MAINBOARD"];
  for (const zone of deckZones) {
    for (const dc of byZone.get(zone) ?? []) mainLines.push(lineFor(dc));
  }
  for (const dc of byZone.get("SIDEBOARD") ?? []) sideLines.push(lineFor(dc));

  if (mainLines.length > 0) {
    lines.push("Deck");
    lines.push(...mainLines);
  }
  if (sideLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Sideboard");
    lines.push(...sideLines);
  }

  return lines.join("\n");
}

export const arenaAdapter: DecklistAdapter = {
  id: "arena",
  detect,
  parse,
  serialize,
};
