import { Suspense } from "react";
import { connection } from "next/server";
import { ExploreFilter } from "@/app/_components/decks/explore-filter";
import { ExploreInfiniteList } from "@/app/_components/decks/explore-infinite-list";
import {
  getPublicDecksWithPreview,
  selectDeckPreviewImages,
} from "@/lib/deck/queries";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Format } from "@/lib/generated/prisma/enums";
import {
  type ParsedFilters,
  type SerializedDeck,
} from "@/app/(ui)/decks/explore/actions";

const SOURCE_VALUES = new Set(["all", "community", "official"]);
type SourceFilter = "all" | "community" | "official";
type SortParam = "updated" | "created" | "released";
const SORT_VALUES = new Set<string>(["updated", "created", "released"]);

interface ExplorePageProps {
  searchParams: Promise<{
    page?: string;
    q?: string;
    format?: string;
    colors?: string;
    commander?: string;
    source?: string;
    sort?: string;
  }>;
}

const PAGE_SIZE = 24;
const WUBRG = new Set(["W", "U", "B", "R", "G"]);
const FORMAT_SET = new Set<string>(Object.values(Format));

async function ExploreContent({
  page,
  filters,
}: {
  page: number;
  filters: ParsedFilters;
}) {
  // Runtime boundary — keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const { decks, total } = await getPublicDecksWithPreview({
    page,
    pageSize: PAGE_SIZE,
    ...filters,
  });

  if (decks.length === 0) {
    const hasFilters =
      !!filters.q ||
      !!filters.format ||
      !!filters.commander ||
      !!filters.colors?.length ||
      (!!filters.source && filters.source !== "all");
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center h-[200px]">
        <p className="text-muted-foreground">
          {hasFilters
            ? "No public decks match your filters."
            : "No public decks yet."}
        </p>
      </div>
    );
  }

  const serializedDecks: SerializedDeck[] = decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    format: deck.format,
    visibility: deck.visibility,
    cardCount: deck.cardCount,
    updatedAt:
      deck.updatedAt instanceof Date
        ? deck.updatedAt.toISOString()
        : deck.updatedAt,
    releasedAt: deck.releasedAt
      ? deck.releasedAt instanceof Date
        ? deck.releasedAt.toISOString()
        : deck.releasedAt
      : null,
    previewImages: selectDeckPreviewImages(deck.format, deck.cards),
    isOfficial: deck.isOfficial,
    commanderName: deck.commanderName,
  }));

  return (
    <ExploreInfiniteList
      initialDecks={serializedDecks}
      total={total}
      pageSize={PAGE_SIZE}
      filters={filters}
    />
  );
}

function ExploreSkeleton() {
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
      <div className="mt-10 h-[20px]" aria-hidden />
    </>
  );
}

function parseFilters(raw: {
  q?: string;
  format?: string;
  colors?: string;
  commander?: string;
  source?: string;
  sort?: string;
}): ParsedFilters {
  const filters: ParsedFilters = {};

  const q = raw.q?.trim();
  if (q) filters.q = q;

  if (raw.format && FORMAT_SET.has(raw.format))
    filters.format = raw.format as Format;

  if (raw.colors) {
    const colors = [...new Set(raw.colors.toUpperCase().split(""))].filter(
      (c) => WUBRG.has(c),
    );
    if (colors.length > 0) filters.colors = colors;
  }

  const commander = raw.commander?.trim();
  if (commander && filters.format === "COMMANDER") filters.commander = commander;

  if (raw.source && SOURCE_VALUES.has(raw.source))
    filters.source = raw.source as SourceFilter;

  if (raw.sort && SORT_VALUES.has(raw.sort))
    filters.sort = raw.sort as SortParam;

  return filters;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const raw = await searchParams;
  const parsed = parseInt(raw.page ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const filters = parseFilters(raw);

  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <Eyebrow className="mb-3">Explore</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Public decks
        </h1>
      </div>

      <ExploreFilter
        q={filters.q ?? ""}
        format={filters.format ?? null}
        colors={filters.colors ?? []}
        commander={filters.commander ?? ""}
        source={filters.source ?? "all"}
        sort={filters.sort ?? "updated"}
      />

      <Suspense fallback={<ExploreSkeleton />}>
        <ExploreContent page={page} filters={filters} />
      </Suspense>
    </div>
  );
}
