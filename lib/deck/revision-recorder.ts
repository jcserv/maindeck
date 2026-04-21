import "server-only";
import { prisma } from "@/lib/db";
import {
  mergeDeltas,
  REVISION_WINDOW_MS,
  type RevisionDelta,
} from "@/lib/deck/revision";

/**
 * Append deltas to the deck's most recent revision if it's still in the
 * 5-minute batching window; otherwise open a new revision. Best-effort — if
 * persistence fails we log and return so the caller's user-facing mutation is
 * unaffected.
 */
export async function recordDeckRevision(
  deckId: string,
  userId: string,
  deltas: RevisionDelta[],
): Promise<void> {
  if (deltas.length === 0) return;

  try {
    const latest = await prisma.deckRevision.findFirst({
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
        await prisma.deckRevision.delete({ where: { id: latest.id } });
      } else {
        await prisma.deckRevision.update({
          where: { id: latest.id },
          data: { changes: merged as unknown as object },
        });
      }
      return;
    }

    await prisma.deckRevision.create({
      data: {
        deckId,
        userId,
        changes: deltas as unknown as object,
      },
    });
  } catch (err) {
    console.error("recordDeckRevision failed", { deckId, err });
  }
}
