import type { ParseResult } from "../parse";
import { arenaAdapter } from "./arena";
import { dekAdapter } from "./dek";
import { textAdapter } from "./text";
import type { DecklistAdapter } from "./types";

export type { DecklistAdapter, AdapterId, DeckWithCards } from "./types";

export const adapters: readonly DecklistAdapter[] = [
  dekAdapter,
  arenaAdapter,
  textAdapter,
];

export function pickAdapter(input: string): DecklistAdapter {
  let best: DecklistAdapter = textAdapter;
  let bestScore = -1;
  for (const adapter of adapters) {
    const score = adapter.detect(input);
    if (score > bestScore) {
      best = adapter;
      bestScore = score;
    }
  }
  return best;
}

export function parseImportText(input: string): ParseResult {
  return pickAdapter(input).parse(input);
}

export { textAdapter, arenaAdapter, dekAdapter };
