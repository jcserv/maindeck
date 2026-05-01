import { parseImportText } from "./parse";
import type { ParseResult } from "./parse";
import { resolveCards, type ResolveResult, type ResolvedCard } from "./resolve";
import { diffDeck, type ExistingDeckCard } from "@/lib/deck/mutation/diff";
import type { PlannedChange } from "@/lib/deck/mutation/types";

export type ResolvedDecklist = {
  parse: ParseResult;
  resolution: ResolveResult;
  warnings: string[];
};

export async function parseAndResolve(text: string): Promise<ResolvedDecklist> {
  const parse = parseImportText(text);
  const resolution = await resolveCards(parse.cards);

  const warnings: string[] = [...parse.warnings, ...resolution.warnings];
  if (parse.unmatchedLines.length > 0) {
    warnings.push(
      `${parse.unmatchedLines.length} line(s) could not be parsed as card entries`,
    );
  }

  return { parse, resolution, warnings };
}

export function matchedResolved(
  resolved: ResolvedDecklist,
): ResolvedCard[] {
  return resolved.resolution.resolved.filter((r) => r.cardId !== null);
}

export function toAddChanges(resolved: ResolvedDecklist): PlannedChange[] {
  return matchedResolved(resolved).map((r) => ({
    op: "add",
    cardId: r.cardId!,
    quantity: r.parsed.quantity,
    zone: r.parsed.zone,
    category: r.parsed.category,
    printingId: r.printingId,
    isFoil: r.isFoil,
  }));
}

export function toReplaceChanges(
  resolved: ResolvedDecklist,
  existing: readonly ExistingDeckCard[],
): PlannedChange[] {
  return diffDeck(resolved.resolution.resolved, existing);
}
