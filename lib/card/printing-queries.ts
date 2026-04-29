import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";

// Returns all printings for a card ordered by id desc (newest ingested first).
// Cached aggressively — printings rarely change.
export async function getPrintingsForCard(cardId: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(`card-printings:${cardId}`);

  return prisma.printing.findMany({
    where: { cardId },
    orderBy: { id: "desc" },
  });
}
