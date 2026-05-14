// INVARIANT: this read MUST stay uncached. Ownership is per-viewer; folding it
// into the deck-scoped cache keyed on deckId would leak one viewer's holdings
// into every reader of the same deck. Mirror the pattern set by
// `hasViewerLikedDeck` at `lib/deck/queries.ts:515`. See INVENTORY.md §4.

import { prisma } from "@/lib/db";
import type { ViewerHolding } from "@/lib/inventory/state";

export async function getViewerHoldingsForDeck(
  deckId: string,
  userId: string | undefined,
): Promise<ViewerHolding[]> {
  if (!userId) return [];

  const deckCards = await prisma.deckCard.findMany({
    where: { deckId },
    select: { cardId: true, printingId: true },
  });
  if (deckCards.length === 0) return [];

  const cardIds = new Set<number>();
  const printingIds = new Set<number>();
  for (const dc of deckCards) {
    cardIds.add(dc.cardId);
    if (dc.printingId !== null) printingIds.add(dc.printingId);
  }

  const rows = await prisma.holding.findMany({
    where: {
      userId,
      OR: [
        { printingId: { in: [...printingIds] } },
        { printing: { cardId: { in: [...cardIds] } } },
      ],
    },
    select: {
      printingId: true,
      isFoil: true,
      state: true,
      printing: { select: { cardId: true } },
    },
  });

  return rows.map((r) => ({
    cardId: r.printing.cardId,
    printingId: r.printingId,
    isFoil: r.isFoil,
    state: r.state,
  }));
}
