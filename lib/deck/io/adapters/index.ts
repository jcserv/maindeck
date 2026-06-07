import { arenaAdapter } from "./arena";
import { dekAdapter } from "./dek";
import { jsonAdapter } from "./json";
import { textAdapter } from "./text";
import type { AdapterId, DecklistParser, DecklistSerializer } from "./types";

// json adapter listed first so its detect score of 1 wins over dek's 0.95
// for `{`-prefixed inputs.
export const adapters: readonly DecklistParser[] = [
  jsonAdapter,
  dekAdapter,
  arenaAdapter,
  textAdapter,
];

export const ADAPTER_BY_ID: Record<AdapterId, DecklistParser> = {
  text: textAdapter,
  arena: arenaAdapter,
  dek: dekAdapter,
  json: jsonAdapter,
};

export const serializers: readonly DecklistSerializer[] = [
  textAdapter,
  arenaAdapter,
];

export { textAdapter, arenaAdapter };
