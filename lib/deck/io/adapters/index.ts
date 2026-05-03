import { arenaAdapter } from "./arena";
import { dekAdapter } from "./dek";
import { textAdapter } from "./text";
import type { AdapterId, DecklistAdapter } from "./types";

export const adapters: readonly DecklistAdapter[] = [
  dekAdapter,
  arenaAdapter,
  textAdapter,
];

export const ADAPTER_BY_ID: Record<AdapterId, DecklistAdapter> = {
  text: textAdapter,
  arena: arenaAdapter,
  dek: dekAdapter,
};

export { textAdapter, arenaAdapter };
