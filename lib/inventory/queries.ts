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

  // OWNED holdings come from the `Holding` table. The WISHLIST signal is
  // synthesized from the viewer's hidden kind=WISHLIST deck (see
  // lib/deck/wishlist-deck.ts) so `computeOwnershipState` stays untouched.
  const [owned, wishlist] = await Promise.all([
    prisma.holding.findMany({
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
    }),
    prisma.deckCard.findMany({
      where: {
        deck: { is: { userId, kind: "WISHLIST" } },
        cardId: { in: [...cardIds] },
      },
      select: { cardId: true, printingId: true, isFoil: true },
    }),
  ]);

  const holdings: ViewerHolding[] = owned.map((r) => ({
    cardId: r.printing.cardId,
    printingId: r.printingId,
    isFoil: r.isFoil,
    state: r.state,
  }));
  for (const dc of wishlist) {
    holdings.push({
      cardId: dc.cardId,
      printingId: dc.printingId,
      isFoil: dc.isFoil,
      state: "WISHLIST",
    });
  }
  return holdings;
}
