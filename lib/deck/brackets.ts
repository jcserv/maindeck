import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Deck } from "./zone-view";

interface BracketInfo {
  id: number;
  name: string;
  shortDescription: string;
  manualOnly?: boolean;
}

export const BRACKETS: readonly BracketInfo[] = [
  {
    id: 1,
    name: "Exhibition",
    shortDescription: "Ultra-casual, unique builds. Manual selection only.",
    manualOnly: true,
  },
  {
    id: 2,
    name: "Core",
    shortDescription: "Precon-level. Few or no game changers.",
  },
  {
    id: 3,
    name: "Upgraded",
    shortDescription: "Tuned precon. A handful of game changers.",
  },
  {
    id: 4,
    name: "Optimized",
    shortDescription: "High-power. Many game changers.",
  },
  {
    id: 5,
    name: "cEDH",
    shortDescription: "Tournament-level. Manual selection only.",
    manualOnly: true,
  },
] as const;

export function getBracketInfo(id: number): BracketInfo | null {
  return BRACKETS.find((b) => b.id === id) ?? null;
}

function isCountedZone(zone: Zone): boolean {
  return zone === Zone.MAINBOARD || zone === Zone.COMMANDER;
}

export function countGameChangers(deck: Deck): number {
  let total = 0;
  for (const dc of deck.cards) {
    if (!isCountedZone(dc.zone)) continue;
    if (dc.card.gameChanger) total += dc.quantity;
  }
  return total;
}

function collectGameChangerCards(
  deck: Deck,
): { name: string; quantity: number }[] {
  const byName = new Map<string, number>();
  for (const dc of deck.cards) {
    if (!isCountedZone(dc.zone)) continue;
    if (!dc.card.gameChanger) continue;
    byName.set(dc.card.name, (byName.get(dc.card.name) ?? 0) + dc.quantity);
  }
  return Array.from(byName, ([name, quantity]) => ({ name, quantity })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
}

export function suggestBracket(gameChangers: number): number {
  if (gameChangers >= 4) return 4;
  if (gameChangers >= 1) return 3;
  return 2;
}

export interface ResolvedBracket {
  bracket: number;
  suggested: number;
  gameChangers: number;
  manual: boolean;
  gameChangerCards: { name: string; quantity: number }[];
}

export function resolveDeckBracket(deck: Deck): ResolvedBracket | null {
  if (deck.format !== Format.COMMANDER) return null;

  const gameChangers = countGameChangers(deck);
  const suggested = suggestBracket(gameChangers);
  const manualBracket = deck.manualBracket;
  const manual = manualBracket != null;
  const bracket = manual ? manualBracket : suggested;

  return {
    bracket,
    suggested,
    gameChangers,
    manual,
    gameChangerCards: collectGameChangerCards(deck),
  };
}
