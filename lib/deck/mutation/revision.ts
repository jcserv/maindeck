import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  mergeDeltas,
  parseRevisionDeltas,
  REVISION_WINDOW_MS,
  type RevisionDelta,
} from "@/lib/deck/revision";

// RevisionDelta[] is structurally compatible with Prisma.InputJsonValue (an
// array of plain JSON objects). Using `satisfies` instead of `as unknown as`
// lets TypeScript verify the structural constraint at compile time.
type JsonCompatible = Prisma.InputJsonValue;

export async function recordDeckRevisionTx(
  tx: Prisma.TransactionClient,
  deckId: string,
  userId: string,
  deltas: RevisionDelta[],
  opts?: { skipMerge?: boolean },
): Promise<void> {
  if (deltas.length === 0) return;

  if (opts?.skipMerge) {
    await tx.deckRevision.create({
      data: {
        deckId,
        userId,
        changes: deltas satisfies JsonCompatible,
      },
    });
    return;
  }

  const latest = await tx.deckRevision.findFirst({
    where: { deckId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, updatedAt: true, changes: true },
  });

  const now = Date.now();
  const withinWindow =
    latest && now - latest.updatedAt.getTime() < REVISION_WINDOW_MS;

  if (withinWindow) {
    const existing = parseRevisionDeltas(latest.changes);
    const merged: RevisionDelta[] = mergeDeltas(existing, deltas);
    if (merged.length === 0) {
      await tx.deckRevision.delete({ where: { id: latest.id } });
    } else {
      await tx.deckRevision.update({
        where: { id: latest.id },
        data: { changes: merged satisfies JsonCompatible },
      });
    }
    return;
  }

  await tx.deckRevision.create({
    data: {
      deckId,
      userId,
      changes: deltas satisfies JsonCompatible,
    },
  });
}
