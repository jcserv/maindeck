import { Zone } from "@/lib/generated/prisma/enums";
import { adapters, ADAPTER_BY_ID } from "./adapters";
import type { AdapterId } from "./adapters/types";

export type ParsedCard = {
  name: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
  zone: Zone;
  category: string | null;
};

export type ParsedDecklist = {
  format: AdapterId;
  cards: ParsedCard[];
  unmatchedLines: string[];
  warnings: string[];
};

export function detectFormat(input: string): AdapterId {
  let bestId: AdapterId = "text";
  let bestScore = -1;
  for (const adapter of adapters) {
    const score = adapter.detect(input);
    if (score > bestScore) {
      bestId = adapter.id;
      bestScore = score;
    }
  }
  return bestId;
}

export function parseDecklist(
  input: string,
  format: AdapterId,
): ParsedDecklist {
  return ADAPTER_BY_ID[format].parse(input);
}
