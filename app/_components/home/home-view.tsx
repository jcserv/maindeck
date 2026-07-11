import { Suspense } from "react";
import { getDecksByUser } from "@/lib/deck/queries";
import { type Format, type Visibility } from "@/lib/generated/prisma/enums";
import { HomeGreeting } from "./home-greeting";
import { DeckStrip, type DeckStripItem } from "./deck-strip";
import { FeaturedDecks, FeaturedDecksSkeleton } from "./featured-decks";
import { UpdatesFeed, UpdatesFeedSkeleton } from "./updates-feed";

interface HomeViewProps {
  userId: string;
  username: string;
}

export async function HomeView({ userId, username }: HomeViewProps) {
  const rawDecks = await getDecksByUser(userId);

  const recentDecks: DeckStripItem[] = rawDecks.slice(0, 4).map((d) => ({
    id: d.id,
    name: d.name,
    format: d.format as Format,
    visibility: d.visibility as Visibility,
    cardCount: d.cardCount,
    updatedAt: d.updatedAt,
    releasedAt: d.releasedAt,
    colors: d.colors,
    heroImage: d.heroImage,
  }));

  return (
    <div className="max-w-330 mx-auto px-6 lg:px-12 py-10 pb-20">
      <HomeGreeting username={username} />

      {/* Jump back in */}
      <div className="mb-14">
        <DeckStrip
          title="Jump back in"
          decks={recentDecks}
          allHref="/decks"
          allLabel="All decks"
        />
      </div>

      {/* Featured community decks */}
      <Suspense fallback={<FeaturedDecksSkeleton />}>
        <FeaturedDecks />
      </Suspense>

      {/* Two-column: updates feed + reserved slot for trending cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 mb-14">
        <Suspense fallback={<UpdatesFeedSkeleton />}>
          <UpdatesFeed userId={userId} />
        </Suspense>
      </div>
    </div>
  );
}
