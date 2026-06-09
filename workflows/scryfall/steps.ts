import { Readable } from "node:stream";
import { revalidateTag } from "next/cache";
import streamArray from "stream-json/streamers/stream-array.js";
import { FatalError, RetryableError, getWritable } from "workflow";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  type CardDiff,
  type PrintingDiff,
  dedupeCards,
  diffCards,
  diffPrintings,
} from "@/lib/scryfall/diff";
import { fetchWithRetry } from "@/lib/http";
import { filterCard, isPaperPlayable } from "@/lib/scryfall/filter";
import { JP_COLLECTOR_QUERIES } from "@/lib/scryfall/jp-collector-queries";
import {
  type CardCreateData,
  type PrintingCreateData,
  toPrintingCreate,
} from "@/lib/scryfall/map";
import { parseManifestEntries, parseScryfallCard } from "@/lib/scryfall/parse";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { getBatchStorage } from "@/lib/staging";
import { logWarn } from "@/lib/telemetry";

// Lock + checkpoint primitives now live in `workflows/_shared/` per the
// workflow DevKit's recommended layout for cross-workflow utilities
// (`node_modules/workflow/docs/foundations/workflows-and-steps.mdx` lines
// 182–203). Re-exported here so existing call sites and tests keep working
// without an import-path churn.
export {
  acquireIngestLock,
  releaseIngestLock,
} from "@/workflows/_shared/ingest-lock";
export {
  getLastCheckpoint,
  writeCheckpoint,
} from "@/workflows/_shared/checkpoint";

const USER_AGENT = "maindeck/0.1";
const BATCH = 500;
const BULK_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export const SCRYFALL_SOURCE = "scryfall:default_cards";

// Parse an HTTP `Retry-After` header value. Per RFC 7231 it's either a
// non-negative integer number of seconds, or an HTTP-date.
// `RetryableError`'s `retryAfter` option takes ms (number) or a Date.
function parseRetryAfter(value: string | null): number | Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Map an HTTP failure to the workflow's error model so the runtime knows
// whether to retry. 4xx is a permanent client-side bug (URL, headers, our
// account), 429 is rate-limit (honor `Retry-After`), 5xx is transient.
// See `node_modules/workflow/docs/foundations/errors-and-retries.mdx` and
// `node_modules/workflow/docs/api-reference/workflow/{fatal-error,retryable-error}.mdx`.
function throwForStatus(label: string, res: Response): never {
  const status = res.status;
  if (status === 429) {
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    const opts = retryAfter !== undefined ? { retryAfter } : undefined;
    throw new RetryableError(`${label}: 429 rate limited`, opts);
  }
  if (status >= 400 && status < 500) {
    throw new FatalError(`${label}: ${status}`);
  }
  throw new RetryableError(`${label}: ${status}`);
}

export async function fetchBulkManifest(): Promise<{
  downloadUri: string;
  updatedAt: string;
}> {
  "use step";
  const res = await fetchWithRetry("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throwForStatus("bulk-data manifest", res);
  const entries = parseManifestEntries(await res.json());
  const entry = entries.find((e) => e.type === "default_cards");
  if (!entry) throw new FatalError("default_cards entry missing");
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

type BatchStats = IngestStats;

// JP collector enrichment touches only Printings (Cards already exist), but it
// reuses the shared printing helpers, which write the full BatchStats shape.
type PrintingStats = BatchStats;

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
  const storage = getBatchStorage<ScryfallCard>("scryfall");

  // Workflow SDK retries the whole step on failure; an in-step retry would
  // double-download a 500MB body. Use a generous timeout to abort hung streams.
  const res = await fetch(downloadUri, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(BULK_DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throwForStatus("bulk download", res);
  if (!res.body) throw new RetryableError(`bulk download: ${res.status} (no body)`);

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

// Per-batch progress entry written to the `progress` namespaced stream so
// ops (and a route owned by Agent W) can read live ingest state via
// `Run.getReadable({ namespace: "progress" })`. See
// `node_modules/workflow/docs/foundations/streaming.mdx` (lines 218–289) and
// `node_modules/workflow/docs/api-reference/workflow/get-writable.mdx`.
type ProgressEntry = {
  batchIndex: number;
  totalBatches: number;
  stats: BatchStats;
  ts: string;
};

// `totalBatches` is optional so callers that don't track it (and existing
// test fixtures that pre-date the namespaced progress stream) can still call
// `upsertBatch(runId, index)` cleanly. When omitted the progress entry
// reports `totalBatches: 0`, signalling "unknown".
export async function upsertBatch(
  runId: string,
  index: number,
  totalBatches?: number,
): Promise<BatchStats> {
  "use step";
  const storage = getBatchStorage<ScryfallCard>("scryfall");
  const cards = await storage.readBatch(runId, index);
  const stats = await upsertCardBatch(cards);
  await emitProgress({ batchIndex: index, totalBatches: totalBatches ?? 0, stats });
  return stats;
}

// Best-effort emit. If we're not in a live workflow context (unit tests,
// direct invocation) `getWritable()` throws — swallow it so progress
// telemetry never blocks ingestion. Real ingest runs always have the
// workflow runtime present.
async function emitProgress(entry: Omit<ProgressEntry, "ts">): Promise<void> {
  let writer: WritableStreamDefaultWriter<ProgressEntry> | undefined;
  try {
    writer = getWritable<ProgressEntry>({ namespace: "progress" }).getWriter();
  } catch (err) {
    logWarn(
      { source: "scryfall.steps", batchIndex: entry.batchIndex },
      "progress stream unavailable; continuing without emit",
      err,
    );
    return;
  }
  try {
    await writer.write({ ...entry, ts: new Date().toISOString() });
  } finally {
    writer.releaseLock();
  }
}

// `totalBatches` is retained but optional for backwards compatibility (precon's
// `cleanupPreconStaging` mirrors this signature, and Agent P in Wave B will
// drop the param entirely). The full fix for orphan blobs when
// `downloadAndStage` crashes mid-flight requires the storage backends
// (`lib/staging/{local,blob,s3}.ts`) to list-and-delete by `runId` prefix
// instead of trusting the caller's count — that touches files outside this
// agent's scope and is deferred. Until then, callers that have a non-zero
// `totalBatches` should still pass it so the deterministic-key cleanup runs.
export async function cleanupStaging(
  runId: string,
  totalBatches?: number,
): Promise<void> {
  "use step";
  const storage = getBatchStorage<ScryfallCard>("scryfall");
  await storage.cleanup(runId, totalBatches ?? 0);
}

export async function invalidateSearchCache(): Promise<void> {
  "use step";
  revalidateTag("card-search", "max");
}

// Atomic checkpoint+invalidate. Doing these as separate steps risks the
// invalidate failing 3 retries after the checkpoint is already written —
// the next cron then sees the manifest unchanged and skips, leaving the
// cache stale forever. Combining them into one step means a failure rolls
// back the perceived progress: the checkpoint write retries, but if it
// already succeeded the underlying upsert is idempotent, and the
// `revalidateTag` is also safe to repeat.
//
// `writeCheckpoint` is kept exported so precon (and future Agent P refactor)
// can still call it directly.
export async function commitScryfallCheckpoint(
  source: string,
  updatedAt: string,
): Promise<void> {
  "use step";
  await prisma.ingestCheckpoint.upsert({
    where: { source },
    create: { source, updatedAt },
    update: { updatedAt },
  });
  revalidateTag("card-search", "max");
}

const SCRYFALL_SEARCH_PAGE_DELAY_MS = 100;

// Paginate a Scryfall `/cards/search` query with `unique=prints`, following
// `next_page` while `has_more`. A 404 means the query matched no cards — a
// valid empty result, not an error. ~100ms courtesy delay between pages keeps
// us within Scryfall's rate guidance. Not a "use step": it's a helper invoked
// from within the `ingestCollectorPrintings` step.
async function fetchScryfallSearch(
  query: string,
): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  let url: string | undefined = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
    query,
  )}&unique=prints`;
  let firstPage = true;
  while (url) {
    if (!firstPage) {
      await new Promise((r) => setTimeout(r, SCRYFALL_SEARCH_PAGE_DELAY_MS));
    }
    firstPage = false;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    // Scryfall returns 404 with an `object: "error"` body when a query matches
    // nothing — a legitimate empty result for a set we don't carry yet.
    if (res.status === 404) return out;
    if (!res.ok) throwForStatus(`scryfall search "${query}"`, res);
    const body = (await res.json()) as {
      data?: unknown[];
      has_more?: boolean;
      next_page?: string;
    };
    for (const raw of body.data ?? []) {
      const parsed = parseScryfallCard(raw);
      // JP cards carry `lang !== "en"`, so `filterCard` would drop them; apply
      // the language-agnostic guard to keep digital-only / token-layout
      // printings out of the paper `Printing` table.
      if (parsed && isPaperPlayable(parsed)) out.push(parsed);
    }
    url = body.has_more ? body.next_page : undefined;
  }
  return out;
}

// Enrichment step: pull the curated JP collector printings via the search API
// and upsert them as Printings against the already-ingested English Cards.
// Runs after the bulk upsert (Cards guaranteed present) and before the
// checkpoint commit. JP printings keep `name` in English (`printed_name` holds
// the Japanese title), so each links to its existing Card by name — no new
// Card rows, no oracle/legality drift.
export async function ingestCollectorPrintings(): Promise<PrintingStats> {
  "use step";
  const stats = emptyStats();

  // Fetch every curated query, deduping by scryfallId across queries.
  const byScryfallId = new Map<string, ScryfallCard>();
  let firstQuery = true;
  for (const query of JP_COLLECTOR_QUERIES) {
    // Courtesy delay between queries, mirroring the inter-page delay in
    // `fetchScryfallSearch`, to stay within Scryfall's rate guidance.
    if (!firstQuery) {
      await new Promise((r) => setTimeout(r, SCRYFALL_SEARCH_PAGE_DELAY_MS));
    }
    firstQuery = false;
    const cards = await fetchScryfallSearch(query);
    for (const c of cards) {
      if (!byScryfallId.has(c.id)) byScryfallId.set(c.id, c);
    }
  }
  const cards = [...byScryfallId.values()];
  if (cards.length === 0) return stats;

  // Resolve cardIds by English name. `buildPrintings` skips any card whose name
  // has no matching Card row.
  const names = [...new Set(cards.map((c) => c.name))];
  const existing = await prisma.card.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  const idByName = new Map(existing.map((r) => [r.name, r.id] as const));

  const printings = buildPrintings(cards, idByName, stats);
  if (printings.length === 0) return stats;

  const existingPrintings = await loadExistingPrintings(printings);
  const diff = diffPrintings(printings, existingPrintings);
  await applyPrintingWrites(diff, stats);

  return stats;
}

async function loadExistingCards(
  cardByName: Map<string, CardCreateData>,
) {
  const names = [...cardByName.keys()];
  const slugs = [...cardByName.values()]
    .map((c) => c.nameSlug)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  return prisma.card.findMany({
    where: { OR: [{ name: { in: names } }, { nameSlug: { in: slugs } }] },
    select: { id: true, name: true, version: true, nameSlug: true },
  });
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
    // skipDuplicates handles concurrent ingest workflows racing on the same
    // names/slugs. createManyAndReturn does not support skipDuplicates on
    // Postgres, so we re-fetch IDs by name after the insert.
    //
    // Stats credit `diff.toInsert.length` (pre-DB), not `createMany.count`.
    // On a step retry, rows already exist and `count` collapses to 0,
    // under-reporting inserts; the diff-size is the stable input the workflow
    // event log will memoize. See `node_modules/workflow/docs/foundations/idempotency.mdx`.
    await prisma.card.createMany({
      data: diff.toInsert,
      skipDuplicates: true,
    });
    stats.cardsInserted += diff.toInsert.length;
    const insertedNames = diff.toInsert.map((c) => c.name);
    const rows = await prisma.card.findMany({
      where: { name: { in: insertedNames } },
      select: { id: true, name: true },
    });
    for (const row of rows) idByName.set(row.name, row.id);
  }

  if (diff.toUpdate.length > 0) {
    // Single bulk upsert per chunk; $executeRaw is auto-committed (one
    // statement needs no transaction). WHERE skips no-op writes that would
    // still bump updated_at and burn WAL.
    const UPSERT_CHUNK = 500;
    for (let i = 0; i < diff.toUpdate.length; i += UPSERT_CHUNK) {
      const chunk = diff.toUpdate.slice(i, i + UPSERT_CHUNK);
      const rows = chunk.map(
        (c) =>
          Prisma.sql`(${c.name}, ${c.nameSlug}, ${c.mainType}::"CardType",
            ${c.typeLine}, ${c.oracleText}, ${c.manaCost}, ${c.cmc},
            ${c.colors}::text[], ${c.colorIdentity}::text[], ${c.keywords}::text[],
            ${c.power}, ${c.toughness}, ${c.games}::text[],
            ${JSON.stringify(c.legalities)}::jsonb,
            ${c.reserved}, ${c.gameChanger}, ${c.version}, now())`,
      );
      await prisma.$executeRaw`
        INSERT INTO card (name, name_slug, main_type, type_line, oracle_text,
          mana_cost, cmc, colors, color_identity, keywords, power, toughness,
          games, legalities, reserved, game_changer, version, updated_at)
        VALUES ${Prisma.join(rows)}
        ON CONFLICT (name) DO UPDATE SET
          name_slug      = EXCLUDED.name_slug,
          main_type      = EXCLUDED.main_type,
          type_line      = EXCLUDED.type_line,
          oracle_text    = EXCLUDED.oracle_text,
          mana_cost      = EXCLUDED.mana_cost,
          cmc            = EXCLUDED.cmc,
          colors         = EXCLUDED.colors,
          color_identity = EXCLUDED.color_identity,
          keywords       = EXCLUDED.keywords,
          power          = EXCLUDED.power,
          toughness      = EXCLUDED.toughness,
          games          = EXCLUDED.games,
          legalities     = EXCLUDED.legalities,
          reserved       = EXCLUDED.reserved,
          game_changer   = EXCLUDED.game_changer,
          version        = EXCLUDED.version,
          updated_at     = now()
        WHERE card.version IS DISTINCT FROM EXCLUDED.version
      `;
    }
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

async function loadExistingPrintings(printings: PrintingCreateData[]) {
  const scryfallIds = printings.map((p) => p.scryfallId);
  return prisma.printing.findMany({
    where: { scryfallId: { in: scryfallIds } },
    select: { scryfallId: true, version: true },
  });
}

async function applyPrintingWrites(
  diff: PrintingDiff,
  stats: BatchStats,
): Promise<void> {
  if (diff.toInsert.length > 0) {
    // skipDuplicates lets parallel ingest workflows race on the same
    // scryfallId without one crashing the batch. Stats credit the pre-DB diff
    // size for the same reason as Cards above (idempotent under retry).
    await prisma.printing.createMany({
      data: diff.toInsert,
      skipDuplicates: true,
    });
    stats.printingsInserted += diff.toInsert.length;
  }

  if (diff.toUpdate.length > 0) {
    const UPSERT_CHUNK = 500;
    for (let i = 0; i < diff.toUpdate.length; i += UPSERT_CHUNK) {
      const chunk = diff.toUpdate.slice(i, i + UPSERT_CHUNK);
      const rows = chunk.map(
        (p) =>
          Prisma.sql`(${p.cardId}, ${p.scryfallId}, ${p.setCode}, ${p.setName},
            ${p.collectorNumber}, ${p.isSerialized}, ${p.finishes}::text[],
            ${p.imageUri}, ${p.backImageUri},
            ${p.priceUsd}::decimal(10,2), ${p.priceUsdFoil}::decimal(10,2),
            ${p.priceUsdEtched}::decimal(10,2), ${p.priceEur}::decimal(10,2),
            ${p.priceEurFoil}::decimal(10,2), ${p.priceEurEtched}::decimal(10,2),
            ${p.rarity}::"rarity", ${p.lang}, ${p.printedName}, ${p.version})`,
      );
      await prisma.$executeRaw`
        INSERT INTO printing (card_id, scryfall_id, set_code, set_name,
          collector_number, is_serialized, finishes, image_uri, back_image_uri,
          price_usd, price_usd_foil, price_usd_etched, price_eur,
          price_eur_foil, price_eur_etched, rarity, lang, printed_name, version)
        VALUES ${Prisma.join(rows)}
        ON CONFLICT (scryfall_id) DO UPDATE SET
          card_id          = EXCLUDED.card_id,
          set_code         = EXCLUDED.set_code,
          set_name         = EXCLUDED.set_name,
          collector_number = EXCLUDED.collector_number,
          is_serialized    = EXCLUDED.is_serialized,
          finishes         = EXCLUDED.finishes,
          image_uri        = EXCLUDED.image_uri,
          back_image_uri   = EXCLUDED.back_image_uri,
          price_usd        = EXCLUDED.price_usd,
          price_usd_foil   = EXCLUDED.price_usd_foil,
          price_usd_etched = EXCLUDED.price_usd_etched,
          price_eur        = EXCLUDED.price_eur,
          price_eur_foil   = EXCLUDED.price_eur_foil,
          price_eur_etched = EXCLUDED.price_eur_etched,
          rarity           = EXCLUDED.rarity,
          lang             = EXCLUDED.lang,
          printed_name     = EXCLUDED.printed_name,
          version          = EXCLUDED.version
        WHERE printing.version IS DISTINCT FROM EXCLUDED.version
      `;
    }
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

  // A card can list the same token id more than once across its all_parts
  // (or two cards in the batch can share one); duplicate (card_id,
  // token_scryfall_id) pairs in a single INSERT make Postgres reject the
  // statement with "ON CONFLICT DO UPDATE command cannot affect row a second
  // time". Dedupe on the conflict key, keeping the last-seen token_name.
  const dedupedRows = [
    ...new Map(
      tokenRows.map((r) => [`${r.cardId} ${r.tokenScryfallId}`, r]),
    ).values(),
  ];

  const UPSERT_CHUNK = 500;
  for (let i = 0; i < dedupedRows.length; i += UPSERT_CHUNK) {
    const chunk = dedupedRows.slice(i, i + UPSERT_CHUNK);
    const rows = chunk.map(
      (r) =>
        Prisma.sql`(${r.cardId}, ${r.tokenName}, ${r.tokenScryfallId})`,
    );
    await prisma.$executeRaw`
      INSERT INTO card_tokens (card_id, token_name, token_scryfall_id)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (card_id, token_scryfall_id) DO UPDATE SET
        token_name = EXCLUDED.token_name
    `;
  }
}

// Diff existing Card rows in this Batch against incoming Scryfall data, then
// apply inserts and updates. Returns name → id so the printing phase can FK
// rows it just wrote.
async function diffAndWriteCards(
  cardByName: Map<string, CardCreateData>,
  stats: BatchStats,
): Promise<Map<string, number>> {
  const existing = await loadExistingCards(cardByName);
  const diff = diffCards(cardByName, existing);
  return applyCardWrites(diff, stats);
}

// Build Printings keyed off the Cards we just wrote, diff against existing
// Printing rows, apply inserts and updates. No-op when no printings map cleanly.
async function diffAndWritePrintings(
  cards: ScryfallCard[],
  idByName: Map<string, number>,
  stats: BatchStats,
): Promise<void> {
  const printings = buildPrintings(cards, idByName, stats);
  if (printings.length === 0) return;

  const existing = await loadExistingPrintings(printings);
  const diff = diffPrintings(printings, existing);
  await applyPrintingWrites(diff, stats);
}

// Per Batch: dedupe → diff+write Cards → diff+write Printings → upsert Tokens.
async function upsertCardBatch(cards: ScryfallCard[]): Promise<BatchStats> {
  const stats = emptyStats();
  if (cards.length === 0) return stats;

  const cardByName = dedupeCards(cards);
  const idByName = await diffAndWriteCards(cardByName, stats);
  await diffAndWritePrintings(cards, idByName, stats);
  await upsertTokens(cards, idByName);

  return stats;
}
