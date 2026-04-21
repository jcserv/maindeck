import { computeDeckPrice } from "@/lib/deck/price";
import type { getDeckById } from "@/lib/deck/queries";

type Deck = NonNullable<Awaited<ReturnType<typeof getDeckById>>>;

interface DeckPriceDisplayProps {
  cards: Deck["cards"];
}

// RSC — no "use client". Calls computeDeckPrice (pure function) server-side.
export function DeckPriceDisplay({ cards }: DeckPriceDisplayProps) {
  const { usd, eur, missingCount } = computeDeckPrice(cards);

  const hasPrice = usd > 0 || eur > 0;

  if (!hasPrice && missingCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {hasPrice && (
        <>
          {usd > 0 && (
            <span className="font-medium text-foreground">
              ${usd.toFixed(2)}
            </span>
          )}
          {eur > 0 && (
            <span className="font-medium text-foreground">
              €{eur.toFixed(2)}
            </span>
          )}
        </>
      )}
      {missingCount > 0 && (
        <span className="text-muted-foreground">
          {missingCount} card{missingCount !== 1 ? "s" : ""} without a printing
        </span>
      )}
    </div>
  );
}
