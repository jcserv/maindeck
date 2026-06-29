import "server-only";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDeckById } from "@/lib/deck/queries";
import { compareDeckCards, compareDeckStats, type DeckComparisonResult } from "@/lib/deck/compare";
import { fetchExternalComparableDeck, buildComparableDeckFromText } from "@/lib/deck/external-fetch";

type ViewableDeck = { userId: string; visibility: import("@/lib/generated/prisma/enums").Visibility };

/**
 * The single source of truth for "may this viewer see this deck": owners see
 * everything; everyone else is limited to non-PRIVATE decks. Mirrors the deck
 * page and `requireDeckViewable` rule so comparison can never leak a PRIVATE
 * deck's contents.
 */
export function canViewDeck(
  deck: ViewableDeck,
  viewerId: string | undefined,
): boolean {
  return deck.visibility !== "PRIVATE" || deck.userId === viewerId;
}

type LoadedDeck = NonNullable<Awaited<ReturnType<typeof getDeckById>>>;

export interface LoadedComparison {
  a: LoadedDeck;
  b: LoadedDeck;
  viewerId: string | undefined;
}

/**
 * Loads both decks for a comparison, enforcing visibility on each. 404s (rather
 * than 403s) when either deck is missing or not viewable so the endpoint can't
 * be used to probe which deck ids exist or are private.
 */
export async function loadComparison(
  aId: string,
  bId: string,
): Promise<LoadedComparison> {
  if (aId === bId) notFound();

  const [session, a, b] = await Promise.all([
    getSession(),
    getDeckById(aId),
    getDeckById(bId),
  ]);

  if (!a || !b) notFound();
  const viewerId = session?.userId;
  if (!canViewDeck(a, viewerId) || !canViewDeck(b, viewerId)) notFound();

  return { a, b, viewerId };
}

/**
 * Loads deck A from the DB (with visibility check) and fetches deck B from an
 * external source (Moxfield, Archidekt). Returns a fully-assembled
 * DeckComparisonResult so the page can render without calling compareDecks again.
 */
export async function loadExternalComparison(
  aId: string,
  bUrl: string,
): Promise<DeckComparisonResult> {
  const [session, a] = await Promise.all([getSession(), getDeckById(aId)]);
  if (!a) notFound();
  const viewerId = session?.userId;
  if (!canViewDeck(a, viewerId)) notFound();

  const b = await fetchExternalComparableDeck(bUrl);

  return {
    a: { id: a.id, name: a.name, format: a.format },
    b: { id: b.id, name: b.name, format: b.format, url: bUrl },
    cards: compareDeckCards(a, b),
    stats: compareDeckStats(a, b),
  };
}

export async function loadTextComparison(
  aId: string,
  bText: string,
): Promise<DeckComparisonResult> {
  const [session, a] = await Promise.all([getSession(), getDeckById(aId)]);
  if (!a) notFound();
  const viewerId = session?.userId;
  if (!canViewDeck(a, viewerId)) notFound();

  const b = await buildComparableDeckFromText(bText);

  return {
    a: { id: a.id, name: a.name, format: a.format },
    b: { id: b.id, name: b.name, format: b.format },
    cards: compareDeckCards(a, b),
    stats: compareDeckStats(a, b),
  };
}
