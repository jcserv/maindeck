import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, type Session } from "./session";

/**
 * 404s on missing *and* unauthorized so callers can't probe deck existence.
 */
export async function requireDeckOwner(deckId: string): Promise<Session> {
  const session = await requireSession();
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { userId: true },
  });
  if (!deck || deck.userId !== session.userId) notFound();
  return session;
}
