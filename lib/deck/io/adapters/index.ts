import { arenaAdapter } from "./arena";
import { dekAdapter } from "./dek";
import { textAdapter } from "./text";
import type { AdapterId, DecklistParser, DecklistSerializer } from "./types";

export const adapters: readonly DecklistParser[] = [
  dekAdapter,
  arenaAdapter,
  textAdapter,
];

export const ADAPTER_BY_ID: Record<AdapterId, DecklistParser> = {
  text: textAdapter,
  arena: arenaAdapter,
  dek: dekAdapter,
};

export const serializers: readonly DecklistSerializer[] = [
  textAdapter,
  arenaAdapter,
];

export { textAdapter, arenaAdapter };
