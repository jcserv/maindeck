import { Readable } from "node:stream";
import streamArray from "stream-json/streamers/stream-array.js";
import { prisma } from "@/lib/db";
import { filterCard } from "@/lib/scryfall/filter";
import {
  type CardCreateData,
  type PrintingCreateData,
  toCardCreate,
  toPrintingCreate,
} from "@/lib/scryfall/map";
import type { ScryfallCard } from "@/lib/scryfall/types";

const USER_AGENT = "maindeck/0.1";

export async function fetchBulkManifest(): Promise<{
  downloadUri: string;
  updatedAt: string;
}> {
  "use step";
  const res = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`bulk-data manifest: ${res.status}`);
  const json = (await res.json()) as {
    data: Array<{ type: string; download_uri: string; updated_at: string }>;
  };
  const entry = json.data.find((e) => e.type === "default_cards");
  if (!entry) throw new Error("default_cards entry missing");
  return { downloadUri: entry.download_uri, updatedAt: entry.updated_at };
}

export type IngestStats = {
  cardsInserted: number;
  cardsUpdated: number;
  cardsUnchanged: number;
  printingsInserted: number;
  printingsUpdated: number;
  printingsUnchanged: number;
  skipped: number;
};

export async function streamAndUpsertAll(
  downloadUri: string,
): Promise<IngestStats> {
  "use step";
  const res = await fetch(downloadUri, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok || !res.body) throw new Error(`bulk download: ${res.status}`);

  const nodeStream = Readable.fromWeb(res.body as never);
  const pipeline = nodeStream.pipe(streamArray.withParserAsStream());

  const BATCH = 500;
  let batch: ScryfallCard[] = [];
  const stats: IngestStats = {
    cardsInserted: 0,
    cardsUpdated: 0,
    cardsUnchanged: 0,
    printingsInserted: 0,
    printingsUpdated: 0,
    printingsUnchanged: 0,
    skipped: 0,
  };

  const flush = async () => {
    if (batch.length === 0) return;
    const current = batch;
    batch = [];

    // Dedupe cards by name (a single Scryfall bulk row per printing).
    const cardByName = new Map<string, CardCreateData>();
    for (const c of current) {
      const create = toCardCreate(c);
      if (!cardByName.has(create.name)) cardByName.set(create.name, create);
    }

    const names = [...cardByName.keys()];
    const existingCards = await prisma.card.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true, version: true },
    });
    const existingByName = new Map(
      existingCards.map((e) => [e.name, e] as const),
    );

    const cardsToInsert: CardCreateData[] = [];
    const cardsToUpdate: CardCreateData[] = [];
    const idByName = new Map<string, number>();

    for (const [name, create] of cardByName) {
      const existing = existingByName.get(name);
      if (!existing) {
        cardsToInsert.push(create);
      } else if (existing.version !== create.version) {
        cardsToUpdate.push(create);
        idByName.set(name, existing.id);
      } else {
        stats.cardsUnchanged += 1;
        idByName.set(name, existing.id);
      }
    }

    if (cardsToInsert.length > 0) {
      const inserted = await prisma.card.createManyAndReturn({
        data: cardsToInsert,
        select: { id: true, name: true },
      });
      for (const row of inserted) idByName.set(row.name, row.id);
      stats.cardsInserted += inserted.length;
    }

    for (const create of cardsToUpdate) {
      await prisma.card.update({
        where: { name: create.name },
        data: create,
      });
    }
    stats.cardsUpdated += cardsToUpdate.length;

    // Build printings now that we have card IDs for everything in the batch.
    const printingCreates: PrintingCreateData[] = [];
    for (const c of current) {
      const cardId = idByName.get(c.name);
      if (cardId === undefined) continue;
      try {
        printingCreates.push(toPrintingCreate(cardId, c));
      } catch {
        // Printings we can't map (e.g. no image_uri) get skipped.
        stats.skipped += 1;
      }
    }

    if (printingCreates.length === 0) return;

    const scryfallIds = printingCreates.map((p) => p.scryfallId);
    const existingPrintings = await prisma.printing.findMany({
      where: { scryfallId: { in: scryfallIds } },
      select: { scryfallId: true, version: true },
    });
    const existingPVersionById = new Map(
      existingPrintings.map((e) => [e.scryfallId, e.version] as const),
    );

    const printingsToInsert: PrintingCreateData[] = [];
    const printingsToUpdate: PrintingCreateData[] = [];
    for (const p of printingCreates) {
      const existingVersion = existingPVersionById.get(p.scryfallId);
      if (existingVersion === undefined) {
        printingsToInsert.push(p);
      } else if (existingVersion !== p.version) {
        printingsToUpdate.push(p);
      } else {
        stats.printingsUnchanged += 1;
      }
    }

    if (printingsToInsert.length > 0) {
      await prisma.printing.createMany({
        data: printingsToInsert,
        skipDuplicates: true,
      });
      stats.printingsInserted += printingsToInsert.length;
    }

    for (const p of printingsToUpdate) {
      await prisma.printing.update({
        where: { scryfallId: p.scryfallId },
        data: p,
      });
    }
    stats.printingsUpdated += printingsToUpdate.length;
  };

  for await (const chunk of pipeline) {
    const { value } = chunk as { key: number; value: ScryfallCard };
    if (!filterCard(value)) {
      stats.skipped += 1;
      continue;
    }
    batch.push(value);
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  return stats;
}
