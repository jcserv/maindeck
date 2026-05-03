import "server-only";
import { requireDeckOwner } from "@/lib/auth/deck-access";
import { withActionLogging } from "@/lib/telemetry";
import { assertNever } from "@/lib/utils";
import {
  deckCardMutationTags,
  deckMetaMutationTagsAll,
  deckPrefetchTag,
  deckTag,
  invalidateTags,
} from "@/lib/deck/cache-tags";

/**
 * Cache-tag policy for an owner-scoped deck mutation.
 *
 * "card"     — DeckCard mutations (mainboard / sideboard / commander zone edits)
 * "category" — DeckCategory or single-row edits (printing pin, foil)
 * "meta"     — Deck-level field edits (name, description, visibility, bracket)
 * "none"     — body emits its own tags (e.g. routes through `applyChanges`)
 *
 * NOTE: this is a TODO seam. Today every body that goes through
 * `applyChanges` keeps its own tag emission via "none"; once the cache-tag
 * policy is centralized further, those bodies will stop emitting and the
 * runner will own the matrix entirely.
 */
type DeckMutationTags = "card" | "category" | "meta" | "none";

function emitTags(deckId: string, kind: DeckMutationTags): void {
  switch (kind) {
    case "none":
      return;
    case "card":
      invalidateTags(deckCardMutationTags({ deckId, withRevision: true }));
      return;
    case "meta":
      invalidateTags(deckMetaMutationTagsAll({ deckId }));
      return;
    case "category":
      // Single per-deck row edits (printing pin, foil, subcategory). Also
      // bumps the prefetch tag because changing a pinned printing changes the
      // image that would be prefetched on hover.
      invalidateTags([deckTag(deckId), deckPrefetchTag(deckId)]);
      return;
    /* c8 ignore next 2 */
    default:
      assertNever(kind);
  }
}

/**
 * Wraps the dance every owner-scoped Deck mutation repeats: 404-on-unauth via
 * `requireDeckOwner`, structured-log unexpected errors via `withActionLogging`,
 * emit the deck's cache tags. Body sees `{ deckId, userId }` already validated.
 *
 * Errors from the body propagate untouched so callers can still catch
 * `InvariantViolation` / `ZodError`.
 */
export function runOwnerDeckMutation<Args extends unknown[], R>(
  source: string,
  tags: DeckMutationTags,
  body: (
    ctx: { deckId: string; userId: string },
    ...args: Args
  ) => Promise<R>,
): (deckId: string, ...args: Args) => Promise<R> {
  return withActionLogging(
    source,
    async (deckId: string, ...args: Args): Promise<R> => {
      const { userId } = await requireDeckOwner(deckId);
      const result = await body({ deckId, userId }, ...args);
      emitTags(deckId, tags);
      return result;
    },
  );
}
