import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireSession, type Session } from "./session";

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

/**
 * Allows owner OR anyone for non-PRIVATE decks (matches the deck page rule).
 * 404s on missing or PRIVATE-and-not-owner so callers can't probe existence.
 */
export async function requireDeckViewable(
  deckId: string,
): Promise<{ isOwner: boolean }> {
  const [session, deck] = await Promise.all([
    getSession(),
    prisma.deck.findUnique({
      where: { id: deckId },
      select: { userId: true, visibility: true },
    }),
  ]);
  if (!deck) notFound();
  const isOwner = session?.userId === deck.userId;
  if (deck.visibility === "PRIVATE" && !isOwner) notFound();
  return { isOwner };
}
