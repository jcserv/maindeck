"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requireDeckOwner } from "@/lib/auth/deck-access";

// Updates the printing and/or foil selection for a single DeckCard row.
// printingId=null clears the printing selection.
export async function updateCardPrinting(
  deckId: string,
  deckCardId: string,
  printingId: number | null,
  isFoil: boolean,
): Promise<void> {
  await requireDeckOwner(deckId);

  const deckCard = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    select: { deckId: true, cardId: true },
  });

  if (!deckCard || deckCard.deckId !== deckId) {
    throw new Error("Not found or unauthorized");
  }

  if (printingId !== null) {
    const printing = await prisma.printing.findUnique({
      where: { id: printingId },
      select: { cardId: true, finishes: true },
    });

    if (!printing) {
      throw new Error("Printing not found");
    }

    if (printing.cardId !== deckCard.cardId) {
      throw new Error("Printing does not belong to this card");
    }

    if (isFoil && !printing.finishes.includes("foil")) {
      throw new Error("This printing is not available in foil");
    }
  }

  await prisma.deckCard.update({
    where: { id: deckCardId },
    data: { printingId, isFoil },
  });

  updateTag(`deck:${deckId}`);
}
