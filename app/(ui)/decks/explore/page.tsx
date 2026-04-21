import { Suspense } from "react";
import { DeckCardPreview } from "@/app/_components/deck-card-preview";
import { ExploreFilter } from "@/app/_components/decks/explore-filter";
import { Pagination } from "@/app/_components/pagination";
import {
  getPublicDecksWithPreview,
  selectDeckPreviewImages,
} from "@/lib/deck/queries";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Format } from "@/lib/generated/prisma/enums";

interface ExplorePageProps {
  searchParams: Promise<{
    page?: string;
    q?: string;
    format?: string;
    colors?: string;
    commander?: string;
  }>;
}

const PAGE_SIZE = 24;
const WUBRG = new Set(["W", "U", "B", "R", "G"]);
const FORMAT_SET = new Set<string>(Object.values(Format));

interface ParsedFilters {
  q?: string;
  format?: Format;
  colors?: string[];
  commander?: string;
}

function buildQueryString(filters: ParsedFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.format) params.set("format", filters.format);
  if (filters.colors?.length) params.set("colors", filters.colors.join(""));
  if (filters.commander && filters.format === "COMMANDER")
    params.set("commander", filters.commander);
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

function buildHref(filters: ParsedFilters, page: number): string {
  const qs = buildQueryString(filters, page);
  return qs ? `/decks/explore?${qs}` : "/decks/explore";
}

async function ExploreContent({
  page,
  filters,
}: {
  page: number;
  filters: ParsedFilters;
}) {
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
      !!filters.colors?.length;
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

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        buildHref={(p) => buildHref(filters, p)}
      />
    </>
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
      />

      <Suspense fallback={<ExploreSkeleton />}>
        <ExploreContent page={page} filters={filters} />
      </Suspense>
    </div>
  );
}
