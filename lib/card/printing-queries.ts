import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getOrSet } from "@/lib/cache";

const PRINTINGS_TTL_SECONDS = 86_400; // 24h — printings change rarely post-ingest

// Returns all printings for a card ordered by id desc (newest ingested first).
// Cached aggressively — printings rarely change.
export async function getPrintingsForCard(cardId: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(`card-printings:${cardId}`);

  return getOrSet(`printing:${cardId}`, PRINTINGS_TTL_SECONDS, () =>
    prisma.printing.findMany({
      where: { cardId },
      orderBy: { id: "desc" },
    }),
  );
}
