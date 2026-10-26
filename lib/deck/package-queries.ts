import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { deckListTag } from "@/lib/deck/cache-tags";
import type { Visibility } from "@/lib/generated/prisma/enums";

export type PackageSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  updatedAt: Date;
  cardCount: number;
};

export async function getPackagesByUser(
  userId: string,
): Promise<PackageSummary[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(deckListTag());

  const packages = await prisma.deck.findMany({
    where: { userId, kind: "PACKAGE" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      visibility: true,
      updatedAt: true,
    },
  });
  if (packages.length === 0) return [];

  const rows = await prisma.deckCard.groupBy({
    by: ["deckId"],
    where: { deckId: { in: packages.map((p) => p.id) } },
    _sum: { quantity: true },
  });
  const counts = new Map(rows.map((r) => [r.deckId, r._sum.quantity ?? 0]));
  return packages.map((p) => ({ ...p, cardCount: counts.get(p.id) ?? 0 }));
}
