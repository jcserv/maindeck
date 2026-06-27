import { Suspense } from "react";
import { connection } from "next/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { requireSession } from "@/lib/auth/session";
import { getOrCreateWishlistDeck } from "@/lib/deck/wishlist-deck";
import { getDeckById } from "@/lib/deck/queries";
import { getViewerHoldingsForDeck } from "@/lib/inventory/queries";
import { DeckBuilder } from "@/app/_components/builder/deck-builder";
import { DeckRouteBridge } from "@/app/_components/header-search/header-search-context";

async function WishlistContent() {
  // Runtime boundary — keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const { userId } = await requireSession();
  const deckId = await getOrCreateWishlistDeck(userId);
  const [deck, viewerHoldings] = await Promise.all([
    getDeckById(deckId),
    getViewerHoldingsForDeck(deckId, userId),
  ]);
  if (!deck) return null;

  return (
    <div className="flex flex-col gap-8">
      <DeckRouteBridge deckId={deck.id} isOwner />
      <div>
        <Eyebrow className="mb-3">Saved</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Wishlist
        </h1>
      </div>
      <DeckBuilder
        deck={deck}
        isOwner
        viewerId={userId}
        viewerHoldings={viewerHoldings}
        toolbar={{ addLands: false, autoCategorize: false }}
      />
    </div>
  );
}

export default function WishlistPage() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-[1800px] mx-auto">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <div className="h-12 w-60 rounded-md bg-muted animate-pulse" />
            <div className="h-[40px]" aria-hidden />
          </div>
        }
      >
        <WishlistContent />
      </Suspense>
    </div>
  );
}
