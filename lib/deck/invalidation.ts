import { invalidate } from "@/lib/cache";

/**
 * Redis keys touched when a user's deck mutates. Mirrors `updateTag`/`cacheTag`
 * on the Cache Components side so the two layers stay in lockstep.
 */
export function deckInvalidationKeys(
  deckId: string,
  userId: string,
): string[] {
  return [
    `deck:${deckId}`,
    `deck:${deckId}:revisions`,
    `decks:user:${userId}:minimal`,
    `decks:user:${userId}:strip`,
    `decks:user:${userId}:preview`,
  ];
}

export function invalidateDeck(deckId: string, userId: string): Promise<void> {
  return invalidate(...deckInvalidationKeys(deckId, userId));
}
