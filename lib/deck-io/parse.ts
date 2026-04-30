import { Zone } from "@/lib/generated/prisma/enums";

export type ParsedCard = {
  name: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
  zone: Zone;
  category: string | null;
};

export type ParseResult = {
  format: "text" | "arena" | "dek";
  cards: ParsedCard[];
  unmatchedLines: string[];
  warnings: string[];
};

export { parseImportText, pickAdapter } from "./adapters";
