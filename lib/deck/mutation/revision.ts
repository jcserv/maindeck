import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  mergeDeltas,
  REVISION_WINDOW_MS,
  type RevisionDelta,
} from "@/lib/deck/revision";

export async function recordDeckRevisionTx(
  tx: Prisma.TransactionClient,
  deckId: string,
  userId: string,
  deltas: RevisionDelta[],
): Promise<void> {
  if (deltas.length === 0) return;

  const latest = await tx.deckRevision.findFirst({
    where: { deckId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, updatedAt: true, changes: true },
  });

  const now = Date.now();
  const withinWindow =
    latest && now - latest.updatedAt.getTime() < REVISION_WINDOW_MS;

  if (withinWindow) {
    const existing = (latest.changes as unknown as RevisionDelta[]) ?? [];
    const merged = mergeDeltas(existing, deltas);
    if (merged.length === 0) {
      await tx.deckRevision.delete({ where: { id: latest.id } });
    } else {
      await tx.deckRevision.update({
        where: { id: latest.id },
        data: { changes: merged as unknown as object },
      });
    }
    return;
  }

  await tx.deckRevision.create({
    data: {
      deckId,
      userId,
      changes: deltas as unknown as object,
    },
  });
}
