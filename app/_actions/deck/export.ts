"use server";

import { requireDeckViewable } from "@/lib/auth/deck-access";
import { getDeckById } from "@/lib/deck/queries";
import { adapters } from "@/lib/deck/io/adapters";
import { toMaindeckJson } from "@/lib/deck/io/serialize";
import type { Zone } from "@/lib/generated/prisma/enums";

export interface ExportOptions {
  zones?: Zone[];
  categories?: string[];
}

export interface DeckExports {
  text: string;
  arena: string;
  json: string;
  availableZones: Zone[];
  availableCategories: string[];
}

export async function getDeckExports(
  deckId: string,
  options?: ExportOptions,
): Promise<DeckExports> {
  await requireDeckViewable(deckId);
  const deck = await getDeckById(deckId);
  if (!deck) {
    return {
      text: "",
      arena: "",
      json: "",
      availableZones: [],
      availableCategories: [],
    };
  }

  const availableZones = [...new Set(deck.cards.map((c) => c.zone))] as Zone[];
  const availableCategories = deck.categories.map((c) => c.name);

  const filteredCards =
    options?.zones || options?.categories
      ? deck.cards.filter((c) => {
          if (options.zones && !options.zones.includes(c.zone)) return false;
          if (
            c.zone === "MAINBOARD" &&
            options.categories &&
            c.category !== null &&
            !options.categories.includes(c.category)
          )
            return false;
          return true;
        })
      : deck.cards;

  const filteredCategories =
    options?.categories
      ? deck.categories.filter((cat) => options.categories!.includes(cat.name))
      : deck.categories;

  const filtered = { ...deck, cards: filteredCards, categories: filteredCategories };

  const out: DeckExports = {
    text: "",
    arena: "",
    json: toMaindeckJson(filtered),
    availableZones,
    availableCategories,
  };
  for (const adapter of adapters) {
    if (adapter.id === "text") out.text = adapter.serialize(filtered);
    else if (adapter.id === "arena") out.arena = adapter.serialize(filtered);
  }
  return out;
}
