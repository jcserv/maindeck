"use server";

import { getPrintingsForCard } from "@/lib/card/printing-queries";

// Thin wrapper — exposes the cached server query as a callable Server Action.
// Auth not required (printings are public data).
// Decimal fields are converted to numbers for safe client serialization.
export async function fetchPrintingsForCard(cardId: number) {
  const printings = await getPrintingsForCard(cardId);

  return printings.map((p) => ({
    ...p,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
    priceUsdFoil: p.priceUsdFoil ? Number(p.priceUsdFoil) : null,
    priceUsdEtched: p.priceUsdEtched ? Number(p.priceUsdEtched) : null,
    priceEur: p.priceEur ? Number(p.priceEur) : null,
    priceEurFoil: p.priceEurFoil ? Number(p.priceEurFoil) : null,
    priceEurEtched: p.priceEurEtched ? Number(p.priceEurEtched) : null,
  }));
}

export type ClientPrinting = Awaited<
  ReturnType<typeof fetchPrintingsForCard>
>[number];
