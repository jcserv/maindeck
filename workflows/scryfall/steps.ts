import { Readable } from "node:stream";
import { revalidateTag } from "next/cache";
import streamArray from "stream-json/streamers/stream-array.js";
import { prisma } from "@/lib/db";
import { fetchWithRetry } from "@/lib/http";
import { filterCard } from "@/lib/scryfall/filter";
import {
  type CardCreateData,
  type PrintingCreateData,
  toCardCreate,
  toPrintingCreate,
} from "@/lib/scryfall/map";
import { parseManifestEntries, parseScryfallCard } from "@/lib/scryfall/parse";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { getBatchStorage } from "@/lib/staging";
import { logWarn } from "@/lib/telemetry";

const USER_AGENT = "maindeck/0.1";
const BATCH = 500;
const BULK_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export const SCRYFALL_SOURCE = "scryfall:default_cards";

export async function getLastCheckpoint(
  source: string,
): Promise<string | null> {
  "use step";
  const row = await prisma.ingestCheckpoint.findUnique({
    where: { source },
    select: { updatedAt: true },
  });
  return row?.updatedAt ?? null;
}

export async function writeCheckpoint(
  source: string,
  updatedAt: string,
): Promise<void> {
  "use step";
  await prisma.ingestCheckpoint.upsert({
    where: { source },
    create: { source, updatedAt },
    update: { updatedAt },
  });
}

export async function fetchBulkManifest(): Promise<{
  downloadUri: string;
  updatedAt: string;
}> {
  "use step";
  const res = await fetchWithRetry("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`bulk-data manifest: ${res.status}`);
  const entries = parseManifestEntries(await res.json());
  const entry = entries.find((e) => e.type === "default_cards");
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
  printingsFailed: number;
  skipped: number;
};

export type BatchStats = IngestStats;

function emptyStats(): BatchStats {
  return {
    cardsInserted: 0,
    cardsUpdated: 0,
    cardsUnchanged: 0,
    printingsInserted: 0,
    printingsUpdated: 0,
    printingsUnchanged: 0,
    printingsFailed: 0,
    skipped: 0,
  };
}

export async function downloadAndStage(
  downloadUri: string,
  runId: string,
): Promise<{ totalBatches: number; filterSkipped: number }> {
  "use step";
  const storage = getBatchStorage();

  // Workflow SDK retries the whole step on failure; an in-step retry would
  // double-download a 500MB body. Use a generous timeout to abort hung streams.
  const res = await fetch(downloadUri, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(BULK_DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new Error(`bulk download: ${res.status}`);

  const nodeStream = Readable.fromWeb(res.body as never);
  const pipeline = nodeStream.pipe(streamArray.withParserAsStream());

  let batch: ScryfallCard[] = [];
  let batchIndex = 0;
  let filterSkipped = 0;

  for await (const chunk of pipeline) {
    const parsed = parseScryfallCard((chunk as { value: unknown }).value);
    if (!parsed || !filterCard(parsed)) {
      filterSkipped += 1;
      continue;
    }
    batch.push(parsed);
    if (batch.length >= BATCH) {
      await storage.writeBatch(runId, batchIndex++, batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await storage.writeBatch(runId, batchIndex++, batch);
  }

  return { totalBatches: batchIndex, filterSkipped };
}

export async function upsertBatch(
  runId: string,
  index: number,
): Promise<BatchStats> {
  "use step";
  const storage = getBatchStorage();
  const cards = await storage.readBatch(runId, index);
  return upsertCardBatch(cards);
}

export async function cleanupStaging(
  runId: string,
  totalBatches: number,
): Promise<void> {
  "use step";
  const storage = getBatchStorage();
  await storage.cleanup(runId, totalBatches);
}

export async function invalidateSearchCache(): Promise<void> {
  "use step";
  revalidateTag("card-search", "max");
}

function dedupeCards(cards: ScryfallCard[]): Map<string, CardCreateData> {
  const cardByName = new Map<string, CardCreateData>();
  for (const c of cards) {
    const create = toCardCreate(c);
    if (!cardByName.has(create.name)) cardByName.set(create.name, create);
  }
  return cardByName;
}

type CardDiff = {
  toInsert: CardCreateData[];
  toUpdate: CardCreateData[];
  unchangedIds: Map<string, number>;
  updateIds: Map<string, number>;
};

async function diffCards(
  cardByName: Map<string, CardCreateData>,
): Promise<CardDiff> {
  const names = [...cardByName.keys()];
  const existing = await prisma.card.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true, version: true, nameSlug: true },
  });
  const existingByName = new Map(existing.map((e) => [e.name, e] as const));

  const diff: CardDiff = {
    toInsert: [],
    toUpdate: [],
    unchangedIds: new Map(),
    updateIds: new Map(),
  };

  for (const [name, create] of cardByName) {
    const found = existingByName.get(name);
    if (!found) {
      diff.toInsert.push(create);
    } else if (found.version !== create.version || found.nameSlug === null) {
      diff.toUpdate.push(create);
      diff.updateIds.set(name, found.id);
    } else {
      diff.unchangedIds.set(name, found.id);
    }
  }
  return diff;
}

async function applyCardWrites(
  diff: CardDiff,
  stats: BatchStats,
): Promise<Map<string, number>> {
  const idByName = new Map<string, number>([
    ...diff.unchangedIds,
    ...diff.updateIds,
  ]);

  if (diff.toInsert.length > 0) {
    const inserted = await prisma.card.createManyAndReturn({
      data: diff.toInsert,
      select: { id: true, name: true },
    });
    for (const row of inserted) idByName.set(row.name, row.id);
    stats.cardsInserted += inserted.length;
  }

  if (diff.toUpdate.length > 0) {
    await prisma.$transaction(
      (tx) =>
        Promise.all(
          diff.toUpdate.map((create) =>
            tx.card.update({ where: { name: create.name }, data: create }),
          ),
        ),
      { timeout: 60_000 },
    );
    stats.cardsUpdated += diff.toUpdate.length;
  }

  stats.cardsUnchanged += diff.unchangedIds.size;
  return idByName;
}

function buildPrintings(
  cards: ScryfallCard[],
  idByName: Map<string, number>,
  stats: BatchStats,
): PrintingCreateData[] {
  const out: PrintingCreateData[] = [];
  for (const c of cards) {
    const cardId = idByName.get(c.name);
    if (cardId === undefined) continue;
    try {
      out.push(toPrintingCreate(cardId, c));
    } catch (err) {
      stats.printingsFailed += 1;
      stats.skipped += 1;
      logWarn(
        { source: "scryfall.steps", scryfallId: c.id },
        "could not map printing",
        err,
      );
    }
  }
  return out;
}

type PrintingDiff = {
  toInsert: PrintingCreateData[];
  toUpdate: PrintingCreateData[];
  unchanged: number;
};

async function diffPrintings(
  printings: PrintingCreateData[],
): Promise<PrintingDiff> {
  const scryfallIds = printings.map((p) => p.scryfallId);
  const existing = await prisma.printing.findMany({
    where: { scryfallId: { in: scryfallIds } },
    select: { scryfallId: true, version: true },
  });
  const versionById = new Map(
    existing.map((e) => [e.scryfallId, e.version] as const),
  );

  const diff: PrintingDiff = { toInsert: [], toUpdate: [], unchanged: 0 };
  for (const p of printings) {
    const v = versionById.get(p.scryfallId);
    if (v === undefined) diff.toInsert.push(p);
    else if (v !== p.version) diff.toUpdate.push(p);
    else diff.unchanged += 1;
  }
  return diff;
}

async function applyPrintingWrites(
  diff: PrintingDiff,
  stats: BatchStats,
): Promise<void> {
  if (diff.toInsert.length > 0) {
    // The diff already excludes existing scryfallIds, so a conflict here means
    // a real TOCTOU bug worth surfacing. createManyAndReturn lets us count the
    // actual inserts instead of trusting the input length.
    const inserted = await prisma.printing.createManyAndReturn({
      data: diff.toInsert,
      select: { scryfallId: true },
    });
    stats.printingsInserted += inserted.length;
  }

  if (diff.toUpdate.length > 0) {
    await prisma.$transaction(
      (tx) =>
        Promise.all(
          diff.toUpdate.map((p) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { scryfallId, cardId, ...data } = p;
            return tx.printing.update({ where: { scryfallId }, data });
          }),
        ),
      { timeout: 60_000 },
    );
    stats.printingsUpdated += diff.toUpdate.length;
  }

  stats.printingsUnchanged += diff.unchanged;
}

async function upsertTokens(
  cards: ScryfallCard[],
  idByName: Map<string, number>,
): Promise<void> {
  const tokenRows: { cardId: number; tokenName: string; tokenScryfallId: string }[] = [];

  for (const c of cards) {
    if (!c.all_parts) continue;
    const cardId = idByName.get(c.name);
    if (cardId === undefined) continue;
    for (const part of c.all_parts) {
      if (part.component === "token") {
        tokenRows.push({ cardId, tokenName: part.name, tokenScryfallId: part.id });
      }
    }
  }

  if (tokenRows.length === 0) return;

  await prisma.$transaction(
    (tx) =>
      Promise.all(
        tokenRows.map((row) =>
          tx.cardToken.upsert({
            where: { cardId_tokenScryfallId: { cardId: row.cardId, tokenScryfallId: row.tokenScryfallId } },
            create: row,
            update: { tokenName: row.tokenName },
          }),
        ),
      ),
    { timeout: 60_000 },
  );
}

async function upsertCardBatch(cards: ScryfallCard[]): Promise<BatchStats> {
  const stats = emptyStats();
  if (cards.length === 0) return stats;

  const cardByName = dedupeCards(cards);
  const cardDiff = await diffCards(cardByName);
  const idByName = await applyCardWrites(cardDiff, stats);

  const printings = buildPrintings(cards, idByName, stats);
  if (printings.length > 0) {
    const printingDiff = await diffPrintings(printings);
    await applyPrintingWrites(printingDiff, stats);
  }

  await upsertTokens(cards, idByName);

  return stats;
}
