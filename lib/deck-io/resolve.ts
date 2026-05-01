import { resolveCardNames, type Match } from "./card-resolver";
import { resolvePrintings, type PrintingPinRequest } from "./printing-resolver";
import type { ParsedCard } from "./parse";

export type { Match };

export type ResolvedCard = {
  parsed: ParsedCard;
  cardId: number | null;
  matchedName: string | null;
  match: Match;
  printingId: number | null;
  isFoil: boolean;
};

export type ResolveResult = {
  resolved: ResolvedCard[];
  unmatched: ParsedCard[];
  warnings: string[];
};

export async function resolveCards(
  parsed: readonly ParsedCard[],
): Promise<ResolveResult> {
  const cardRows = await resolveCardNames(parsed);

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
      pinRequests.push({
        cardId: row.cardId,
        setCode: row.parsed.set,
        collectorNumber: row.parsed.collectorNumber,
        isFoil: row.parsed.isFoil,
        displayName: row.matchedName ?? row.parsed.name,
      });
    }
  }

  const pins = await resolvePrintings(pinRequests);

  const warnings: string[] = [];
  const resolved: ResolvedCard[] = cardRows.map((row, i) => {
    const pinIdx = requestIndexByRow.get(i);
    const pin = pinIdx !== undefined ? pins[pinIdx] : undefined;
    if (pin?.warning) warnings.push(pin.warning);
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

  return { resolved, unmatched, warnings };
}
