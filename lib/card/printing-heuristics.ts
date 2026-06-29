import { isUniversesBeyondSet } from "@/lib/card/universes-beyond";

// Heuristics for bulk-reselecting the printing of every card in a deck.
//
// "cheapest"            — pin the lowest-priced printing of each card
// "most-expensive"      — pin the highest-priced printing of each card
// "no-universes-beyond" — if the current printing is a Universes Beyond
//                         release, swap it for the cheapest non-UB printing
//
// All functions here are pure (no DB, no Decimal). Prices are plain USD
// numbers; callers coerce Prisma Decimal columns before calling in.
export type PrintingHeuristic =
  | "cheapest"
  | "most-expensive"
  | "no-universes-beyond";

const PRINTING_HEURISTICS: readonly PrintingHeuristic[] = [
  "cheapest",
  "most-expensive",
  "no-universes-beyond",
];

export function isPrintingHeuristic(value: string): value is PrintingHeuristic {
  return (PRINTING_HEURISTICS as readonly string[]).includes(value);
}

/** Minimal printing shape the heuristics need — id, set, and USD prices. */
export type HeuristicPrinting = {
  id: number;
  setCode: string;
  priceUsd: number | null;
  priceUsdFoil: number | null;
};

/**
 * The USD price the deck total and per-card display actually count for this
 * printing: foil price when the line is foil (falling back to nonfoil, mirroring
 * `computeDeckPrice`), otherwise nonfoil. Etched is never counted, so it never
 * factors into cheapest/most-expensive — choosing it could only raise the total
 * the deck reports. Returns null when the relevant basis is unpriced.
 */
export function basisUsd(p: HeuristicPrinting, isFoil: boolean): number | null {
  if (isFoil) return p.priceUsdFoil ?? p.priceUsd;
  return p.priceUsd;
}

/** Lowest-id printing — the canonical fallback shown when no pin is set. */
function canonicalFirstPrinting(
  printings: readonly HeuristicPrinting[],
): HeuristicPrinting | null {
  if (printings.length === 0) return null;
  return printings.reduce((lo, p) => (p.id < lo.id ? p : lo));
}

// Picks the priced printing with the extreme (min/max) price. Unpriced
// printings are ineligible. Ties break on lowest id for determinism.
function pickByPrice(
  printings: readonly HeuristicPrinting[],
  priceOf: (p: HeuristicPrinting) => number | null,
  prefer: "min" | "max",
): HeuristicPrinting | null {
  let best: HeuristicPrinting | null = null;
  let bestPrice = 0;

  for (const p of printings) {
    const price = priceOf(p);
    if (price == null) continue;

    if (
      best === null ||
      (prefer === "min" ? price < bestPrice : price > bestPrice) ||
      (price === bestPrice && p.id < best.id)
    ) {
      best = p;
      bestPrice = price;
    }
  }

  return best;
}

// Among non-UB printings, prefer the cheapest one in the basis the deck counts;
// fall back to the lowest-id non-UB printing when none are priced (still a valid
// swap target).
function pickCheapestNonUb(
  printings: readonly HeuristicPrinting[],
  isFoil: boolean,
): HeuristicPrinting | null {
  const nonUb = printings.filter((p) => !isUniversesBeyondSet(p.setCode));
  if (nonUb.length === 0) return null;
  return (
    pickByPrice(nonUb, (p) => basisUsd(p, isFoil), "min") ??
    nonUb.reduce((lo, p) => (p.id < lo.id ? p : lo))
  );
}

/**
 * Returns the printing id this card should be repinned to under `heuristic`,
 * or `null` to leave the card unchanged. `null` covers every "no data loss"
 * case: no eligible printing, or the heuristic already chooses what's pinned.
 */
export function selectPrintingId(
  printings: readonly HeuristicPrinting[],
  heuristic: PrintingHeuristic,
  currentPrintingId: number | null,
  isFoil: boolean,
): number | null {
  let chosen: HeuristicPrinting | null;

  switch (heuristic) {
    case "cheapest":
    case "most-expensive":
      // Only repins cards with an existing pin. computeDeckPrice counts only
      // pinned printings, so leaving unpinned cards alone keeps these
      // heuristics from ever raising the reported deck total.
      if (currentPrintingId == null) return null;
      chosen = pickByPrice(
        printings,
        (p) => basisUsd(p, isFoil),
        heuristic === "cheapest" ? "min" : "max",
      );
      break;
    case "no-universes-beyond": {
      // Fall back to the canonical printing the deck displays when no pin is set,
      // so unpinned canonical-UB cards get swapped too.
      const current =
        currentPrintingId != null
          ? printings.find((p) => p.id === currentPrintingId)
          : canonicalFirstPrinting(printings);
      if (!current || !isUniversesBeyondSet(current.setCode)) return null;
      chosen = pickCheapestNonUb(printings, isFoil);
      break;
    }
  }

  if (chosen === null || chosen.id === currentPrintingId) return null;
  return chosen.id;
}
