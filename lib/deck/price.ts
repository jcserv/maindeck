import type { Zone } from "@/lib/generated/prisma/client";

const EXCLUDED_ZONES: Zone[] = ["SIDEBOARD", "CONSIDERING"];

type PricePrinting = {
  priceUsd: number | null;
  priceUsdFoil: number | null;
  priceEur: number | null;
  priceEurFoil: number | null;
};

type PriceRow = {
  quantity: number;
  zone: Zone;
  isFoil: boolean;
  printing: PricePrinting | null;
};

type DeckPrice = {
  usd: number;
  eur: number;
  missingCount: number;
};

// Pure function — no DB access.
// Computes total deck price from already-fetched DeckCard rows with their
// associated printing. Excludes Sideboard and Considering zones; Commander
// is included (it's part of the deck's identity).
export function computeDeckPrice(cards: PriceRow[]): DeckPrice {
  let usd = 0;
  let eur = 0;
  let missingCount = 0;

  for (const row of cards) {
    if (EXCLUDED_ZONES.includes(row.zone)) continue;

    if (!row.printing) {
      missingCount++;
      continue;
    }

    const { printing, isFoil, quantity } = row;

    const rowUsd = isFoil
      ? printing.priceUsdFoil ?? printing.priceUsd ?? 0
      : printing.priceUsd ?? 0;

    const rowEur = isFoil
      ? printing.priceEurFoil ?? printing.priceEur ?? 0
      : printing.priceEur ?? 0;

    usd += rowUsd * quantity;
    eur += rowEur * quantity;
  }

  return { usd, eur, missingCount };
}
