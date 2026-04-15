// Stub for Vercel Blob-backed staging storage.
//
// When we deploy to Vercel, wire this up:
//   1. `pnpm add @vercel/blob`
//   2. Set BLOB_READ_WRITE_TOKEN in the environment
//   3. Implement using `put` / `head` / `del` from @vercel/blob, keyed by
//      `scryfall/${runId}/batch-${index}.json`.
//
// Existing today so the factory in ./index.ts has a real class to switch on.
import type { ScryfallCard } from "@/lib/scryfall/types";
import type { BatchStorage } from "./types";

function notImplemented(): never {
  throw new Error(
    "VercelBlobStorage not implemented — install @vercel/blob and wire BLOB_READ_WRITE_TOKEN",
  );
}

export class VercelBlobStorage implements BatchStorage {
  async writeBatch(
    runId: string,
    index: number,
    cards: ScryfallCard[],
  ): Promise<void> {
    void runId;
    void index;
    void cards;
    notImplemented();
  }

  async readBatch(runId: string, index: number): Promise<ScryfallCard[]> {
    void runId;
    void index;
    notImplemented();
  }

  async cleanup(runId: string): Promise<void> {
    void runId;
    notImplemented();
  }
}
