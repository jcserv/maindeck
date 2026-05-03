import "server-only";

import { resolveCardNames, type Match } from "./card-resolver";
import { resolvePrintings, type PrintingPinRequest } from "./printing-resolver";
import type { ParsedCard, ParsedDecklist } from "./parse";

export type { Match };

export type ResolvedCard = {
  parsed: ParsedCard;
  cardId: number | null;
  matchedName: string | null;
  match: Match;
  printingId: number | null;
  isFoil: boolean;
};

export type ResolvedDecklist = {
  parsed: ParsedDecklist;
  cards: ResolvedCard[];
  unmatched: ParsedCard[];
  warnings: string[];
};

export async function resolveDecklist(
  parsed: ParsedDecklist,
): Promise<ResolvedDecklist> {
  const cardRows = await resolveCardNames(parsed.cards);

  const pinRequests: PrintingPinRequest[] = [];
  const requestIndexByRow = new Map<number, number>();
  for (let i = 0; i < cardRows.length; i++) {
    const row = cardRows[i]!;
    if (
      row.cardId !== null &&
      row.parsed.set !== undefined &&
      row.parsed.collectorNumber !== undefined
    ) {
      requestIndexByRow.set(i, pinRequests.length);
      // matchedName is non-null whenever cardId is non-null (resolveCardNames
      // sets them in lockstep).
      pinRequests.push({
        cardId: row.cardId,
        setCode: row.parsed.set,
        collectorNumber: row.parsed.collectorNumber,
        isFoil: row.parsed.isFoil,
        displayName: row.matchedName!,
      });
    }
  }

  const pins = await resolvePrintings(pinRequests);

  const resolveWarnings: string[] = [];
  const cards: ResolvedCard[] = cardRows.map((row, i) => {
    const pinIdx = requestIndexByRow.get(i);
    const pin = pinIdx !== undefined ? pins[pinIdx] : undefined;
    if (pin?.warning) resolveWarnings.push(pin.warning);
    return {
      parsed: row.parsed,
      cardId: row.cardId,
      matchedName: row.matchedName,
      match: row.match,
      printingId: pin?.printingId ?? null,
      isFoil: pin?.isFoil ?? row.parsed.isFoil,
    };
  });

  const unmatched = cardRows
    .filter((r) => r.match.kind === "none")
    .map((r) => r.parsed);

  const warnings = [...parsed.warnings, ...resolveWarnings];
  if (parsed.unmatchedLines.length > 0) {
    warnings.push(
      `${parsed.unmatchedLines.length} line(s) could not be parsed as card entries`,
    );
  }

  return { parsed, cards, unmatched, warnings };
}
