import { Suspense } from "react";
import { connection } from "next/server";
import Link from "@/app/_components/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { requireSession } from "@/lib/auth/session";
import { getSavedDecksForUser } from "@/lib/deck/saved-queries";
import { selectDeckPreviewImages } from "@/lib/deck/queries";
import { DeckCardPreview } from "@/app/_components/decks/deck-card-preview";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface SavedPageProps {
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 24;

async function SavedContent({ page }: { page: number }) {
  // Runtime boundary — keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const { userId } = await requireSession();
  const { items, total } = await getSavedDecksForUser({
    userId,
    page,
    pageSize: PAGE_SIZE,
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center h-[200px]">
        <p className="text-muted-foreground">
          No saved decks yet — bookmark any public deck and it will show up
          here.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((item) => {
          if (!item.deck) {
            return (
              <div
                key={item.deckId}
                className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/30 p-4 min-h-[120px] text-muted-foreground"
                aria-label="No longer available"
              >
                <p className="text-sm font-medium">No longer available</p>
                <p className="text-xs">
                  This deck is private now. You can unsave it from the deck
                  page when its owner makes it public again.
                </p>
              </div>
            );
          }
          const deck = item.deck;
          return (
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
          );
        })}
      </div>

      {(hasPrev || hasNext) && (
        <nav
          aria-label="Saved decks pagination"
          className="mt-10 flex items-center justify-between gap-2 h-[40px]"
        >
          {hasPrev ? (
            <Link
              href={`/saved?page=${page - 1}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Previous
            </Link>
          ) : (
            <span aria-hidden />
          )}
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {hasNext ? (
            <Link
              href={`/saved?page=${page + 1}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Next
            </Link>
          ) : (
            <span aria-hidden />
          )}
        </nav>
      )}
    </>
  );
}

function SavedSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
      <div className="mt-10 h-[40px]" aria-hidden />
    </>
  );
}

export default async function SavedPage({ searchParams }: SavedPageProps) {
  const raw = await searchParams;
  const parsed = parseInt(raw.page ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <Eyebrow className="mb-3">Bookmarks</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Saved decks
        </h1>
      </div>

      <Suspense fallback={<SavedSkeleton />}>
        <SavedContent page={page} />
      </Suspense>
    </div>
  );
}
