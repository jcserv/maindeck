import "server-only";

import { diffDeck, type ExistingDeckCard } from "@/lib/deck/mutation/diff";
import type { PlannedChange } from "@/lib/deck/mutation/types";
import type { ResolvedCard, ResolvedDecklist } from "./resolve";

export function decklistAsAdds(resolved: ResolvedDecklist): PlannedChange[] {
  return resolved.cards
    .filter((r): r is ResolvedCard & { cardId: number } => r.cardId !== null)
    .map((r) => ({
      op: "add",
      cardId: r.cardId,
      quantity: r.parsed.quantity,
      zone: r.parsed.zone,
      category: r.parsed.category,
      printingId: r.printingId,
      isFoil: r.isFoil,
    }));
}

export function decklistAsReplace(
  resolved: ResolvedDecklist,
  existing: readonly ExistingDeckCard[],
): PlannedChange[] {
  return diffDeck(resolved.cards, existing);
}
