import "server-only";
import { prisma } from "@/lib/db";

/**
 * Resolve the user's hidden `kind=WISHLIST` deck id, creating it lazily.
 *
 * The wishlist is an ordinary `Deck` flagged `kind=WISHLIST` so the builder and
 * every deckId-keyed server action work against it unchanged. The single-
 * wishlist guarantee is enforced at the app layer (find-first-or-create); the
 * `[userId, kind]` index keeps the lookup cheap.
 */
export async function getOrCreateWishlistDeck(userId: string): Promise<string> {
  const existing = await prisma.deck.findFirst({
    where: { userId, kind: "WISHLIST" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.deck.create({
    data: {
      userId,
      name: "Wishlist",
      format: "CASUAL",
      visibility: "PRIVATE",
      kind: "WISHLIST",
    },
    select: { id: true },
  });
  return created.id;
}
