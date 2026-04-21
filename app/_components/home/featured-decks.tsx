import { DeckCardPreview } from "@/app/_components/deck-card-preview";
import Link from "@/app/_components/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  getPublicDecksWithPreview,
  selectDeckPreviewImages,
} from "@/lib/deck/queries";

function Header() {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <Eyebrow>Popular decks</Eyebrow>
      <Link
        href="/decks/explore"
        className="inline-flex items-center gap-1 text-[12.5px] text-primary hover:underline"
      >
        Explore
        <svg
          aria-hidden="true"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}

export async function FeaturedDecks() {
  const { decks } = await getPublicDecksWithPreview({ page: 1, pageSize: 3 });

  if (decks.length === 0) return null;

  return (
    <div className="mb-14">
      <Header />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {decks.map((deck) => (
          <DeckCardPreview
            key={deck.id}
            id={deck.id}
            name={deck.name}
            format={deck.format}
            visibility={deck.visibility}
            cardCount={deck.cardCount}
            updatedAt={deck.updatedAt}
            previewImages={selectDeckPreviewImages(deck.format, deck.cards)}
          />
        ))}
      </div>
    </div>
  );
}

export function FeaturedDecksSkeleton() {
  return (
    <div className="mb-14">
      <Header />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-55 rounded-xl bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
