import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { searchCards } from "@/lib/search/card-search";
import { searchCardsBySyntax } from "@/lib/search/card-search";
import { parseSyntax } from "@/lib/search/syntax-parser";
import { SearchForm } from "@/app/_components/search/search-form";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    mode?: string;
    colors?: string;
    types?: string;
    limit?: string;
  }>;
}

async function SearchResults({
  searchParams,
}: {
  searchParams: SearchPageProps["searchParams"];
}) {
  const { q, mode, colors: colorsParam, types: typesParam, limit: limitParam } =
    await searchParams;

  const query = q?.trim() ?? "";
  const searchMode = mode === "syntax" || mode === "ai" ? mode : "simple";
  const colors = colorsParam ? colorsParam.toUpperCase().split("") : [];
  const types = typesParam ? typesParam.split(",").filter(Boolean) : [];
  const limit = Math.min(parseInt(limitParam ?? "60", 10) || 60, 120);

  let results: Awaited<ReturnType<typeof searchCards>> = [];

  if (query || colors.length || types.length) {
    if (searchMode === "syntax") {
      const parsed = parseSyntax(query);
      results = await searchCardsBySyntax(parsed, colors, types, limit);
    } else if (searchMode === "simple") {
      if (colors.length || types.length) {
        const parsed = parseSyntax("");
        if (query) parsed.nameFragments.push(query);
        results = await searchCardsBySyntax(parsed, colors, types, limit);
      } else if (query) {
        results = await searchCards(query, limit);
      }
    }
    // AI mode: results handled client-side via server action, no SSR results
  }

  return (
    <SearchForm
      initialQuery={query}
      initialMode={searchMode}
      initialColors={colors}
      initialTypes={types}
      initialResults={results}
      initialCount={results.length}
    />
  );
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <Eyebrow className="mb-3">Find a card</Eyebrow>
      <h1 className="mb-7 font-display text-4xl font-medium tracking-tight leading-none md:text-5xl">
        Card search
      </h1>

      <Suspense
        fallback={
          <div>
            {/* Reserve space for the search control */}
            <div className="h-[100px] rounded border border-border bg-card animate-pulse mb-3.5" />
            {/* Filter rail placeholder */}
            <div className="h-[52px] mb-7 border-b border-border" />
            {/* Results grid skeleton */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[5/7] rounded-md bg-muted animate-pulse"
                />
              ))}
            </div>
          </div>
        }
      >
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
