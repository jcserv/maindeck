import { prisma } from "@/lib/db";

export type PrintingPinRequest = {
  cardId: number;
  setCode: string;
  collectorNumber: string;
  isFoil: boolean;
  /** Used for the foil-unavailable warning text. */
  displayName: string;
};

type PrintingPin = {
  printingId: number | null;
  isFoil: boolean;
  warning: string | null;
};

type PrintingRow = {
  id: number;
  cardId: number;
  setCode: string;
  collectorNumber: string;
  finishes: string[];
};

function pinKey(cardId: number, setCode: string, collectorNumber: string): string {
  return `${cardId}|${setCode.toLowerCase()}|${collectorNumber}`;
}

/**
 * Resolve `(cardId, setCode, collectorNumber)` triples to Printing pins, in
 * one batched query. If a request asks for foil but the matched Printing
 * doesn't list "foil" among its finishes, the pin's `isFoil` is dropped to
 * false and a warning is emitted.
 *
 * Printing.setCode is stored lowercase (Scryfall convention); incoming
 * `setCode` may be any case — it's compared case-insensitively.
 */
export async function resolvePrintings(
  requests: readonly PrintingPinRequest[],
): Promise<PrintingPin[]> {
  if (requests.length === 0) return [];

  const lookups = requests.map((r) => ({
    cardId: r.cardId,
    setCode: r.setCode.toLowerCase(),
    collectorNumber: r.collectorNumber,
  }));

  const printings = (await prisma.printing.findMany({
    where: { OR: lookups },
    select: {
      id: true,
      cardId: true,
      setCode: true,
      collectorNumber: true,
      finishes: true,
    },
  })) as PrintingRow[];

  const byKey = new Map<string, PrintingRow>();
  for (const p of printings) {
    byKey.set(pinKey(p.cardId, p.setCode, p.collectorNumber), p);
  }

  return requests.map((r) => {
    const printing = byKey.get(pinKey(r.cardId, r.setCode, r.collectorNumber));
    if (!printing) {
      return { printingId: null, isFoil: r.isFoil, warning: null };
    }
    if (r.isFoil && !printing.finishes.includes("foil")) {
      return {
        printingId: printing.id,
        isFoil: false,
        /* v8 ignore next */
        warning: `${r.displayName} (${r.setCode} ${r.collectorNumber}) is not available in foil; importing as nonfoil.`,
      };
    }
    return { printingId: printing.id, isFoil: r.isFoil, warning: null };
  });
}
