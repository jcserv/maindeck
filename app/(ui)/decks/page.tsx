import { Suspense } from "react";
import { connection } from "next/server";
import { GitCompareArrows, LayoutGrid, List, Plus } from "lucide-react";
import Link from "@/app/_components/link";
import { DecksFilter } from "@/app/_components/decks/decks-filter";
import { DecksStatsStrip } from "@/app/_components/decks/decks-stats-strip";
import { requireSession } from "@/lib/auth/session";
import {
  getDecksByUserWithPreview,
  selectDeckPreviewImages,
} from "@/lib/deck/queries";
import { buttonVariants } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

interface DecksPageProps {
  searchParams: Promise<{ view?: string }>;
}

async function DecksContent({ view }: { view: "grid" | "list" }) {
  // Runtime boundary — keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const { userId } = await requireSession();
  const decks = await getDecksByUserWithPreview(userId);

  if (decks.length === 0) {
    return (
      <>
        <DecksStatsStrip decks={[]} />
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4 h-[200px]">
          <p className="text-muted-foreground">No decks yet.</p>
          <Link href="/deck/new" className={cn(buttonVariants())}>
            <Plus className="h-4 w-4" aria-hidden />
            Create Deck
          </Link>
        </div>
      </>
    );
  }

  const rows = decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    format: deck.format,
    visibility: deck.visibility,
    cardCount: deck.cardCount,
    updatedAt: deck.updatedAt,
    releasedAt: deck.releasedAt,
    previewImages: selectDeckPreviewImages(deck.format, deck.cards),
  }));

  return (
    <>
      <DecksStatsStrip decks={decks} />
      <DecksFilter decks={rows} view={view} />
    </>
  );
}

function DecksContentSkeleton() {
  return (
    <>
      {/* Stats strip skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-8 h-[92px]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-background px-5 py-[18px] animate-pulse">
            <div className="h-2.5 w-16 rounded bg-muted mb-3" />
            <div className="h-7 w-10 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Filter + grid skeleton */}
      <div className="mb-6 h-8 w-60 rounded-lg bg-muted animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    </>
  );
}

export default async function DecksPage({ searchParams }: DecksPageProps) {
  const { view: rawView } = await searchParams;
  const view: "grid" | "list" = rawView === "list" ? "list" : "grid";

  const gridHref = "?view=grid";
  const listHref = "?view=list";

  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      {/* Editorial header */}
      <div className="flex items-end justify-between mb-10 gap-4">
        <div>
          <Eyebrow className="mb-3">Your library</Eyebrow>
          <h1 className="text-5xl font-medium leading-none tracking-tight">
            Decks
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div
            className="flex border border-border rounded overflow-hidden"
            role="group"
            aria-label="View mode"
          >
            <Link
              href={gridHref}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={cn(
                "inline-flex items-center justify-center w-8 h-8 transition-colors",
                view === "grid"
                  ? "bg-muted text-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link
              href={listHref}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={cn(
                "inline-flex items-center justify-center w-8 h-8 transition-colors",
                view === "list"
                  ? "bg-muted text-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {/* Compare CTA */}
          <Link
            href="/decks/compare"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden />
            Compare
          </Link>

          {/* New deck CTA */}
          <Link
            href="/deck/new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New Deck
          </Link>
        </div>
      </div>

      <Suspense fallback={<DecksContentSkeleton />}>
        <DecksContent view={view} />
      </Suspense>

      {/* Mobile FAB — new deck */}
      <Link
        href="/deck/new"
        aria-label="Create new deck"
        className="md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-4 z-40 size-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </Link>
    </div>
  );
}
