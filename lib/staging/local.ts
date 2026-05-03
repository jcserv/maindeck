import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BatchStorage } from "./types";

export class LocalFsStorage<T> implements BatchStorage<T> {
  constructor(private readonly namespace: string) {}

  private dirFor(runId: string): string {
    return path.join(os.tmpdir(), `maindeck-${this.namespace}`, runId);
  }

  async writeBatch(runId: string, index: number, items: T[]): Promise<void> {
    const dir = this.dirFor(runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `batch-${index}.json`),
      JSON.stringify(items),
    );
  }

  async readBatch(runId: string, index: number): Promise<T[]> {
    const file = path.join(this.dirFor(runId), `batch-${index}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T[];
  }

  async cleanup(runId: string, _totalBatches: number): Promise<void> {
    await fs.rm(this.dirFor(runId), { recursive: true, force: true });
  }
}
