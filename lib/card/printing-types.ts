import { getPrintingsForCard } from "@/lib/card/printing-queries";

type DbPrinting = Awaited<ReturnType<typeof getPrintingsForCard>>[number];

// Client-safe shape of a Printing — Decimal columns coerced to number for serialization.
export type ClientPrinting = Omit<
  DbPrinting,
  | "priceUsd"
  | "priceUsdFoil"
  | "priceUsdEtched"
  | "priceEur"
  | "priceEurFoil"
  | "priceEurEtched"
> & {
  priceUsd: number | null;
  priceUsdFoil: number | null;
  priceUsdEtched: number | null;
  priceEur: number | null;
  priceEurFoil: number | null;
  priceEurEtched: number | null;
};

export function serializePrinting(printing: DbPrinting): ClientPrinting {
  return {
    ...printing,
    priceUsd: printing.priceUsd ? Number(printing.priceUsd) : null,
    priceUsdFoil: printing.priceUsdFoil ? Number(printing.priceUsdFoil) : null,
    priceUsdEtched: printing.priceUsdEtched ? Number(printing.priceUsdEtched) : null,
    priceEur: printing.priceEur ? Number(printing.priceEur) : null,
    priceEurFoil: printing.priceEurFoil ? Number(printing.priceEurFoil) : null,
    priceEurEtched: printing.priceEurEtched ? Number(printing.priceEurEtched) : null,
  };
}

export function serializePrintings(printings: readonly DbPrinting[]): ClientPrinting[] {
  return printings.map(serializePrinting);
}
