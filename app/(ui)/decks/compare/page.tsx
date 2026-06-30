import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { requireSession } from "@/lib/auth/session";
import { getDecksByUserMinimal } from "@/lib/deck/queries";
import { loadComparison, loadExternalComparison, loadTextComparison } from "@/lib/deck/compare-queries";
import { compareDecks } from "@/lib/deck/compare";
import { ExternalFetchError } from "@/lib/deck/external-fetch";
import { DeckComparison } from "@/app/_components/deck/deck-comparison";
import { DeckComparePicker } from "@/app/_components/deck/deck-compare-picker";
import { PasteCompareLoader } from "@/app/_components/deck/paste-compare-loader";

// Comparison pages are viewer-specific and not useful to index.
export const metadata: Metadata = {
  title: "Compare decks",
  robots: { index: false, follow: false },
};

interface ComparePageProps {
  searchParams: Promise<{ a?: string; b?: string; bUrl?: string; bText?: string; bPaste?: string }>;
}

async function CompareContent({ searchParams }: ComparePageProps) {
  // Runtime boundary — keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const { a, b, bUrl, bText, bPaste } = await searchParams;

  if (a && bPaste) {
    return <PasteCompareLoader a={a} pasteKey={bPaste} />;
  }

  if (a && bText) {
    const result = await loadTextComparison(a, bText);
    return <DeckComparison result={result} />;
  }

  if (a && bUrl) {
    let externalError: string | null = null;
    let externalResult: Awaited<ReturnType<typeof loadExternalComparison>> | null = null;
    try {
      externalResult = await loadExternalComparison(a, bUrl);
    } catch (err) {
      if (err instanceof ExternalFetchError) {
        externalError = err.message;
      } else {
        throw err;
      }
    }
    if (externalError) return <p className="text-sm text-destructive">{externalError}</p>;
    if (externalResult) return <DeckComparison result={externalResult} />;
  }

  if (a && b) {
    const { a: deckA, b: deckB } = await loadComparison(a, b);
    return <DeckComparison result={compareDecks(deckA, deckB)} />;
  }

  // No pair chosen yet — show the picker over the viewer's own decks.
  const { userId } = await requireSession();
  const decks = await getDecksByUserMinimal(userId);

  if (decks.length === 0) {
    return (
      <p className="text-muted-foreground">
        You need at least one deck to compare. Create a deck first.
      </p>
    );
  }

  return (
    <DeckComparePicker
      decks={decks.map((d) => ({ id: d.id, name: d.name }))}
      initialA={a ?? ""}
      initialB={b ?? ""}
    />
  );
}

export default function ComparePage({ searchParams }: ComparePageProps) {
  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <Eyebrow className="mb-3">Decks</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Compare
        </h1>
      </div>

      <Suspense
        fallback={<div className="h-[200px]" aria-hidden />}
      >
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
