import "server-only";
import { updateTag } from "next/cache";
import { Visibility } from "@/lib/generated/prisma/enums";

/**
 * Cache-tag taxonomy for the Deck domain.
 *
 * One Module owns the literal tag strings so reads, writes, and tests don't
 * each spell them differently. Helpers return the exact strings that
 * `cacheTag(...)` / `updateTag(...)` expect — runtime behavior is unchanged.
 *
 * Visibility-driven tagging: `decks:public` is bumped only when a Deck is or
 * was PUBLIC, so private-deck edits no longer invalidate the public-discovery
 * cache. Pass `prevVisibility` when a write may flip visibility (e.g.
 * PRIVATE → PUBLIC); both old and new values matter.
 */

/** Singleton: list of decks for an authenticated owner. */
export function deckListTag(): string {
  return "deck-list";
}

/** Singleton: discoverable PUBLIC deck list (landing strip, /decks index). */
export function publicDecksTag(): string {
  return "decks:public";
}

/** Per-user deck list (with previews). */
export function userDecksTag(userId: string): string {
  return `decks:user:${userId}`;
}

/** Per-deck detail tag (drives `getDeckById` invalidation). */
export function deckTag(deckId: string): string {
  return `deck:${deckId}`;
}

/** Per-deck revision-history tag (drives the deck history view). */
export function deckRevisionsTag(deckId: string): string {
  return `deck:${deckId}:revisions`;
}

/** Per-deck token list tag (drives `getDeckTokens`). */
export function deckTokensTag(deckId: string): string {
  return `deck-tokens:${deckId}`;
}

/** Per-card "decks containing this card" tag. */
export function cardDecksTag(cardId: number | string): string {
  return `card-decks:${cardId}`;
}

/**
 * Tags to bump on a Deck-row mutation (name, description, visibility, bracket).
 * Includes `decks:public` only if the deck is or was PUBLIC, so private edits
 * don't invalidate the discovery cache.
 *
 * Callers that don't yet plumb visibility through use {@link deckMetaMutationTagsAll}
 * and bump unconditionally. New code should prefer this visibility-aware variant.
 */
export function deckMutationTags(input: {
  deckId: string;
  visibility: Visibility;
  prevVisibility?: Visibility;
}): readonly string[] {
  const tags: string[] = [deckListTag(), deckTag(input.deckId)];
  if (
    input.visibility === Visibility.PUBLIC ||
    input.prevVisibility === Visibility.PUBLIC
  ) {
    tags.push(publicDecksTag());
  }
  return tags;
}

/**
 * Tags to bump for a Deck-row mutation when the caller doesn't have visibility
 * context. Bumps `decks:public` regardless — preserves the historical
 * over-broad invalidation. Includes `deck:${deckId}` only when supplied.
 */
export function deckMetaMutationTagsAll(input: {
  deckId?: string;
}): readonly string[] {
  const tags: string[] = [deckListTag(), publicDecksTag()];
  if (input.deckId) tags.push(deckTag(input.deckId));
  return tags;
}

/**
 * Tags to bump when a Deck is created. Skips `deck:${id}` (no readers exist for
 * a brand-new id) and only bumps `decks:public` when the new deck is PUBLIC.
 */
export function deckCreateTags(input: {
  visibility: Visibility;
}): readonly string[] {
  const tags: string[] = [deckListTag()];
  if (input.visibility === Visibility.PUBLIC) {
    tags.push(publicDecksTag());
  }
  return tags;
}

/**
 * Tags to bump when a Deck is deleted. Always bumps `deck:${id}` so any
 * outstanding `getDeckById` cache returns null on next read.
 */
export function deckDeleteTags(input: {
  deckId: string;
  visibility: Visibility;
}): readonly string[] {
  const tags: string[] = [deckListTag(), deckTag(input.deckId)];
  if (input.visibility === Visibility.PUBLIC) {
    tags.push(publicDecksTag());
  }
  return tags;
}

// TODO(perf): bump prefetch:deck/${id} when deck images change so the prefetch manifest doesn't go stale

/**
 * Tags to bump when DeckCard rows change (zone moves, quantity edits, printing
 * pins). Card-level edits never affect the deck-list previews enough to
 * justify bumping `deck-list` / `decks:public`.
 */
export function deckCardMutationTags(input: {
  deckId: string;
  withRevision?: boolean;
}): readonly string[] {
  const tags: string[] = [deckTag(input.deckId)];
  if (input.withRevision) {
    tags.push(deckRevisionsTag(input.deckId));
  }
  return tags;
}

/** Fan out `updateTag` over a tag set. Centralizes the loop. */
export function invalidateTags(tags: readonly string[]): void {
  for (const tag of tags) {
    updateTag(tag);
  }
}
