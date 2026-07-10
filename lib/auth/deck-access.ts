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

/**
 * A candidate can propose changes to a deck when collaboration is enabled,
 * they aren't the owner, and the *owner* follows them — eligibility is a
 * direction check on `Follow`, not a separate invite/allowlist.
 */
export async function canCollaborateOnDeck(
  deck: { userId: string; collaborationEnabled: boolean },
  sessionUserId: string | undefined,
): Promise<boolean> {
  if (!deck.collaborationEnabled) return false;
  if (!sessionUserId || sessionUserId === deck.userId) return false;
  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: deck.userId,
        followingId: sessionUserId,
      },
    },
    select: { followerId: true },
  });
  return follow !== null;
}

/**
 * 404s on missing session, missing deck, *and* on ineligible collaborator so
 * callers can't probe deck existence or collaboration state. Uses
 * `getSession` (not `requireSession`) so anonymous visitors 404 instead of
 * being redirected to sign-in — a redirect would itself leak that
 * collaboration is possibly enabled for a deck they can't otherwise see.
 * Matches `collaborate/page.tsx`'s inline eligibility check.
 */
export async function requireDeckCollaborator(deckId: string): Promise<{
  deckId: string;
  userId: string;
  deck: { userId: string; collaborationEnabled: boolean };
}> {
  const session = await getSession();
  if (!session) notFound();
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { userId: true, collaborationEnabled: true },
  });
  if (!deck) notFound();
  const eligible = await canCollaborateOnDeck(deck, session.userId);
  if (!eligible) notFound();
  return { deckId, userId: session.userId, deck };
}
