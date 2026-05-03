import { del, get, put } from "@vercel/blob";
import type { BatchStorage } from "./types";

export class VercelBlobStorage<T> implements BatchStorage<T> {
  private readonly token: string;
  private readonly namespace: string;

  constructor(namespace: string, token?: string) {
    const resolved = token ?? process.env["BLOB_READ_WRITE_TOKEN"];
    if (!resolved) {
      throw new Error(
        "VercelBlobStorage requires BLOB_READ_WRITE_TOKEN. " +
          "Set it in your environment or use STAGING_DRIVER=local for dev.",
      );
    }
    this.token = resolved;
    this.namespace = namespace;
  }

  private keyFor(runId: string, index: number): string {
    return `${this.namespace}/${runId}/batch-${index}.json`;
  }

  async writeBatch(runId: string, index: number, items: T[]): Promise<void> {
    await put(this.keyFor(runId, index), JSON.stringify(items), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
      token: this.token,
    });
  }

  async readBatch(runId: string, index: number): Promise<T[]> {
    const key = this.keyFor(runId, index);
    let result: Awaited<ReturnType<typeof get>>;
    try {
      result = await get(key, { access: "private", token: this.token });
    } catch (err) {
      throw new Error(`VercelBlobStorage.readBatch: missing batch ${key}`, {
        cause: err,
      });
    }
    if (!result || result.statusCode !== 200) {
      throw new Error(`VercelBlobStorage.readBatch: missing batch ${key}`);
    }
    return (await new Response(result.stream).json()) as T[];
  }

  async cleanup(runId: string, totalBatches: number): Promise<void> {
    if (totalBatches <= 0) return;
    const keys = Array.from({ length: totalBatches }, (_, i) =>
      this.keyFor(runId, i),
    );
    await del(keys, { token: this.token });
  }
}
