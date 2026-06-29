"use client";

import { useEffect, useState } from "react";
import { DeckComparison } from "./deck-comparison";
import { compareFromPaste } from "@/app/(ui)/decks/compare/actions";
import type { DeckComparisonResult } from "@/lib/deck/compare";

export function PasteCompareLoader({
  a,
  pasteKey,
}: {
  a: string;
  pasteKey: string;
}) {
  const [result, setResult] = useState<DeckComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const text = sessionStorage.getItem(`compare-paste:${pasteKey}`);
      if (!text) {
        setError("Decklist not found. Go back and paste it again.");
        return;
      }
      try {
        const r = await compareFromPaste(a, text);
        setResult(r);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to compare decks.");
      }
    }
    void run();
  }, [a, pasteKey]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!result) return <div className="h-[200px]" aria-hidden />;
  return <DeckComparison result={result} />;
}
