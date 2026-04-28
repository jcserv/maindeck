import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { LocalFsStorage } from "../local";

function makeCard(name: string): ScryfallCard {
  return {
    id: `id-${name}`,
    lang: "en",
    layout: "normal",
    games: ["paper"],
    name,
    set: "tst",
    set_name: "Test",
    collector_number: "1",
  };
}

describe("LocalFsStorage", () => {
  let runId: string;
  let storage: LocalFsStorage;

  beforeEach(() => {
    runId = `test-${randomUUID()}`;
    storage = new LocalFsStorage();
  });

  afterEach(async () => {
    await storage.cleanup(runId, 3);
  });

  it("round-trips a batch", async () => {
    const cards = [makeCard("A"), makeCard("B")];
    await storage.writeBatch(runId, 0, cards);
    const read = await storage.readBatch(runId, 0);
    expect(read).toEqual(cards);
  });

  it("supports multiple coexisting batches", async () => {
    const b0 = [makeCard("A")];
    const b1 = [makeCard("B"), makeCard("C")];
    const b2 = [makeCard("D")];
    await storage.writeBatch(runId, 0, b0);
    await storage.writeBatch(runId, 1, b1);
    await storage.writeBatch(runId, 2, b2);
    expect(await storage.readBatch(runId, 0)).toEqual(b0);
    expect(await storage.readBatch(runId, 1)).toEqual(b1);
    expect(await storage.readBatch(runId, 2)).toEqual(b2);
  });

  it("readBatch rejects for a missing index", async () => {
    await storage.writeBatch(runId, 0, [makeCard("A")]);
    await expect(storage.readBatch(runId, 99)).rejects.toThrow();
  });

  it("cleanup removes the directory", async () => {
    await storage.writeBatch(runId, 0, [makeCard("A")]);
    await storage.cleanup(runId, 1);
    await expect(storage.readBatch(runId, 0)).rejects.toThrow();
  });
});
