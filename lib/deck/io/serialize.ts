import type { Zone } from "@/lib/generated/prisma/enums";
import { arenaAdapter, textAdapter } from "./adapters";
import type { DeckWithCards } from "./adapters/types";

const ZONE_ORDER: Zone[] = ["COMMANDER", "MAINBOARD", "SIDEBOARD", "CONSIDERING"];

export function toPlainText(deck: DeckWithCards): string {
  return textAdapter.serialize(deck);
}

export function toArena(deck: DeckWithCards): string {
  return arenaAdapter.serialize(deck);
}

type JsonCard = {
  name: string;
  quantity: number;
  zone: Zone;
  category: string | null;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
  printingId?: number;
};

type MaindeckJson = {
  name: string;
  format: string;
  visibility: string;
  description: string | null;
  cards: JsonCard[];
  categories: Array<{ name: string; sortOrder: number }>;
};

export function toMaindeckJson(deck: DeckWithCards): string {
  const cards: JsonCard[] = deck.cards
    .map((dc): JsonCard => ({
      name: dc.card.name,
      quantity: dc.quantity,
      zone: dc.zone,
      category: dc.category,
      ...(dc.printing?.setCode !== undefined && { set: dc.printing.setCode.toUpperCase() }),
      ...(dc.printing?.collectorNumber !== undefined && { collectorNumber: dc.printing.collectorNumber }),
      isFoil: dc.isFoil,
      ...(dc.printingId != null && { printingId: dc.printingId }),
    }))
    .sort((a, b) => {
      const zoneDiff = ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone);
      if (zoneDiff !== 0) return zoneDiff;
      return a.name.localeCompare(b.name);
    });

  const sortedCategories = [...deck.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ name: c.name, sortOrder: c.sortOrder }));

  const payload: MaindeckJson = {
    name: deck.name,
    format: deck.format,
    visibility: deck.visibility,
    description: deck.description ?? null,
    cards,
    categories: sortedCategories,
  };

  return JSON.stringify(payload, null, 2);
}
