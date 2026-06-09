import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { serializePrintings, type ClientPrinting } from "@/lib/card/printing-types";

// Returns all printings for a card ordered by id desc (newest ingested first).
// Cached aggressively — printings rarely change. Decimal price columns are coerced
// to number *inside* the cache boundary; Prisma Decimal can't cross `'use cache'`.
export async function getPrintingsForCard(cardId: number): Promise<ClientPrinting[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(`card-printings:${cardId}`);

  const rows = await prisma.printing.findMany({
    where: { cardId },
    orderBy: { id: "desc" },
  });
  return serializePrintings(rows);
}
