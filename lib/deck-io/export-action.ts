"use server";

import { getDeckById } from "@/lib/deck/queries";
import { toPlainText, toArena, toMaindeckJson } from "@/lib/deck-io/serialize";

export interface DeckExports {
  text: string;
  arena: string;
  json: string;
}

export async function getDeckExports(deckId: string): Promise<DeckExports> {
  const deck = await getDeckById(deckId);
  if (!deck) {
    return { text: "", arena: "", json: "" };
  }
  return {
    text: toPlainText(deck),
    arena: toArena(deck),
    json: toMaindeckJson(deck),
  };
}
