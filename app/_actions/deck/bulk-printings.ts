"use server";

import { prisma } from "@/lib/db";
import { runOwnerDeckMutation } from "@/lib/deck/mutation";
import {
  isPrintingHeuristic,
  selectPrintingId,
  type HeuristicPrinting,
  type PrintingHeuristic,
} from "@/lib/card/printing-heuristics";

export type BulkReselectPrintingsResult = {
  changed: number;
  total: number;
};

type Decimalish = { toString(): string } | null;

function toNumber(value: Decimalish): number | null {
  return value == null ? null : Number(value);
}

/**
 * Bulk-reselects the pinned printing of every card in a deck according to a
 * heuristic ("cheapest", "most-expensive", "no-universes-beyond"). Cards with
 * no printing matching the heuristic are left untouched. Foil pins are cleared
 * only when the newly chosen printing has no foil finish.
 */
export const bulkReselectPrintings = runOwnerDeckMutation(
  "deck.bulkReselectPrintings",
  "category",
  async (
    { deckId },
    heuristic: PrintingHeuristic,
  ): Promise<BulkReselectPrintingsResult> => {
    if (!isPrintingHeuristic(heuristic)) {
      throw new Error(`Unknown printing heuristic: ${heuristic}`);
    }

    const rows = await prisma.deckCard.findMany({
      where: { deckId },
      select: {
        id: true,
        printingId: true,
        isFoil: true,
        card: {
          select: {
            printings: {
              select: {
                id: true,
                setCode: true,
                finishes: true,
                priceUsd: true,
                priceUsdFoil: true,
                priceUsdEtched: true,
              },
            },
          },
        },
      },
    });

    const updates: { id: string; printingId: number; isFoil: boolean }[] = [];

    for (const row of rows) {
      const printings: HeuristicPrinting[] = row.card.printings.map((p) => ({
        id: p.id,
        setCode: p.setCode,
        priceUsd: toNumber(p.priceUsd),
        priceUsdFoil: toNumber(p.priceUsdFoil),
        priceUsdEtched: toNumber(p.priceUsdEtched),
      }));

      const nextId = selectPrintingId(printings, heuristic, row.printingId);
      if (nextId === null) continue;

      const next = row.card.printings.find((p) => p.id === nextId);
      // Drop the foil pin if the chosen printing can't be foil.
      const isFoil = row.isFoil && (next?.finishes.includes("foil") ?? false);

      updates.push({ id: row.id, printingId: nextId, isFoil });
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.deckCard.update({
            where: { id: u.id },
            data: { printingId: u.printingId, isFoil: u.isFoil },
          }),
        ),
      );
    }

    return { changed: updates.length, total: rows.length };
  },
);
