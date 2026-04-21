import { Suspense } from "react";
import { getRecentPublicDecksForStrip } from "@/lib/deck/queries";
import { LandingHero } from "./landing-hero";
import { LandingPitch } from "./landing-pitch";
import { DeckStrip } from "./deck-strip";

const STRIP_LIMIT = 5;

async function RecentDeckStrip() {
  const decks = await getRecentPublicDecksForStrip(STRIP_LIMIT);
  return (
    <DeckStrip
      title="Popular decks"
      decks={decks}
      allHref="/decks/explore"
      allLabel="Explore decks"
    />
  );
}

function RecentDeckStripSkeleton() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2.5 mb-5">
        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,360px))] gap-2">
        {Array.from({ length: STRIP_LIMIT }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-sm bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

export function LandingView() {
  return (
    <div className="max-w-295 mx-auto px-6 lg:px-12 py-20 pb-30">
      <LandingHero />

      {/* Divider */}
      <hr className="border-border mb-16" />

      <LandingPitch />

      {/* Recent decks strip */}
      <div className="mb-12">
        <Suspense fallback={<RecentDeckStripSkeleton />}>
          <RecentDeckStrip />
        </Suspense>
      </div>
    </div>
  );
}
