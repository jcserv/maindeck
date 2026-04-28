import type { ScryfallCard } from "@/lib/scryfall/types";

export interface BatchStorage {
  writeBatch(runId: string, index: number, cards: ScryfallCard[]): Promise<void>;
  readBatch(runId: string, index: number): Promise<ScryfallCard[]>;
  cleanup(runId: string, totalBatches: number): Promise<void>;
}
