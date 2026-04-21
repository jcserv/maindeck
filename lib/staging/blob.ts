import { del, get, list, put } from "@vercel/blob";
import type { ScryfallCard } from "@/lib/scryfall/types";
import type { BatchStorage } from "./types";

const ROOT_PREFIX = "scryfall";

const keyFor = (runId: string, index: number) =>
  `${ROOT_PREFIX}/${runId}/batch-${index}.json`;
const prefixFor = (runId: string) => `${ROOT_PREFIX}/${runId}/`;

export class VercelBlobStorage implements BatchStorage {
  private readonly token: string;

  constructor(token?: string) {
    const resolved = token ?? process.env.BLOB_READ_WRITE_TOKEN;
    if (!resolved) {
      throw new Error(
        "VercelBlobStorage requires BLOB_READ_WRITE_TOKEN. " +
          "Set it in your environment or use STAGING_DRIVER=local for dev.",
      );
    }
    this.token = resolved;
  }

  async writeBatch(
    runId: string,
    index: number,
    cards: ScryfallCard[],
  ): Promise<void> {
    await put(keyFor(runId, index), JSON.stringify(cards), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
      token: this.token,
    });
  }

  async readBatch(runId: string, index: number): Promise<ScryfallCard[]> {
    const key = keyFor(runId, index);
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
    return (await new Response(result.stream).json()) as ScryfallCard[];
  }

  async cleanup(runId: string): Promise<void> {
    const prefix = prefixFor(runId);
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, token: this.token });
      if (page.blobs.length > 0) {
        await del(
          page.blobs.map((b) => b.pathname),
          { token: this.token },
        );
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
}
