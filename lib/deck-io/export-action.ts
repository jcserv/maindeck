"use server";

import { requireDeckViewable } from "@/lib/auth/deck-access";
import { getDeckById } from "@/lib/deck/queries";
import { adapters } from "@/lib/deck-io/adapters";
import { toMaindeckJson } from "@/lib/deck-io/serialize";

export interface DeckExports {
  text: string;
  arena: string;
  json: string;
}

export async function getDeckExports(deckId: string): Promise<DeckExports> {
  await requireDeckViewable(deckId);
  const deck = await getDeckById(deckId);
  if (!deck) {
    return { text: "", arena: "", json: "" };
  }

  const out: DeckExports = { text: "", arena: "", json: toMaindeckJson(deck) };
  for (const adapter of adapters) {
    if (adapter.id === "text") out.text = adapter.serialize(deck);
    else if (adapter.id === "arena") out.arena = adapter.serialize(deck);
  }
  return out;
}
