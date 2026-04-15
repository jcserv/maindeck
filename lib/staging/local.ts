import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ScryfallCard } from "@/lib/scryfall/types";
import type { BatchStorage } from "./types";

export class LocalFsStorage implements BatchStorage {
  private dirFor(runId: string): string {
    return path.join(os.tmpdir(), "maindeck-scryfall", runId);
  }

  async writeBatch(
    runId: string,
    index: number,
    cards: ScryfallCard[],
  ): Promise<void> {
    const dir = this.dirFor(runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `batch-${index}.json`),
      JSON.stringify(cards),
    );
  }

  async readBatch(runId: string, index: number): Promise<ScryfallCard[]> {
    const file = path.join(this.dirFor(runId), `batch-${index}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as ScryfallCard[];
  }

  async cleanup(runId: string): Promise<void> {
    await fs.rm(this.dirFor(runId), { recursive: true, force: true });
  }
}
