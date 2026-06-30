"use server";

import { loadTextComparison } from "@/lib/deck/compare-queries";
import type { DeckComparisonResult } from "@/lib/deck/compare";

export async function compareFromPaste(
  a: string,
  text: string,
): Promise<DeckComparisonResult> {
  return loadTextComparison(a, text);
}
