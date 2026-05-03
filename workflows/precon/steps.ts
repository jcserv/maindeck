import { revalidateTag } from "next/cache";
import { getWritable } from "workflow";
import { prisma } from "@/lib/db";
import { intakeDecklist } from "@/lib/deck/io/intake";
import {
  publicDecksTag,
  userDecksTag,
} from "@/lib/deck/cache-tags";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import {
  buildDecklistText,
  classifyPrecon,
  hashDeckContent,
  type PreconRejection,
  mapMtgjsonTypeToFormat,
} from "@/lib/precon/map";
import {
  fetchMtgjsonDeck,
  fetchMtgjsonDeckList,
  fetchMtgjsonMeta,
  type MtgjsonDeckIndexEntry,
} from "@/lib/precon/mtgjson";
import { getBatchStorage } from "@/lib/staging";
import { logInfo, logWarn } from "@/lib/telemetry";
import { SCRYFALL_SOURCE } from "@/workflows/scryfall/steps";

export const PRECON_SOURCE = "mtgjson:decks";
// PRECON_SOURCE identifies the ingest run on `IngestCheckpoint`;
// MTGJSON_ORIGIN identifies a deck's external origin on `Deck` and
// `IngestDeckFailure`. They intentionally differ.
const MTGJSON_ORIGIN = "mtgjson";

const BATCH = 50;
const FETCH_CONCURRENCY = 8;
const SCRYFALL_FRESHNESS_MAX_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const WOTC_USER_ID = "wotc";

export type PreconBatchStats = {
  decksInserted: number;
  decksUpdated: number;
  decksUnchanged: number;
  decksFailed: number;
  cardsUnmatched: number;
};

export function emptyPreconStats(): PreconBatchStats {
  return {
    decksInserted: 0,
    decksUpdated: 0,
    decksUnchanged: 0,
    decksFailed: 0,
    cardsUnmatched: 0,
  };
}

export type PreconDeckBatch = {
  code: string;
  name: string;
  releaseDate: string;
  type: string;
  contentHash: string;
  decklistText: string;
};

type SkipDetail = {
  code: string;
  name: string;
  type: string;
  rejection: Extract<PreconRejection, { ok: false }>;
};

type PreconManifest = {
  version: string;
  deckIndex: MtgjsonDeckIndexEntry[];
};

export async function fetchPreconManifest(): Promise<PreconManifest> {
  "use step";
  const [meta, deckIndex] = await Promise.all([
    fetchMtgjsonMeta(),
    fetchMtgjsonDeckList(),
  ]);
  return { version: meta.version, deckIndex };
}

// New precon releases reference cards that won't resolve until Scryfall has
// been ingested. Bail early if the Scryfall checkpoint is too old — better to
// skip a run than write a deck full of unmatched names.
export async function scryfallCheckpointFreshEnough(): Promise<boolean> {
  "use step";
  const row = await prisma.ingestCheckpoint.findUnique({
    where: { source: SCRYFALL_SOURCE },
    select: { ranAt: true },
  });
  if (!row) return false;
  return Date.now() - row.ranAt.getTime() < SCRYFALL_FRESHNESS_MAX_MS;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T);
    }
  };
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

export async function downloadAndStagePrecons(
  deckIndex: MtgjsonDeckIndexEntry[],
  runId: string,
): Promise<{
  totalBatches: number;
  failedFetches: number;
  skippedNonPlayable: number;
}> {
  "use step";
  const storage = getBatchStorage<PreconDeckBatch>("precon");

  type FetchResult =
    | { ok: true; batch: PreconDeckBatch }
    | { ok: false; code: string; skipped: SkipDetail }
    | { ok: false; code: string; err: unknown };

  const results = await runWithConcurrency<MtgjsonDeckIndexEntry, FetchResult>(
    deckIndex,
    FETCH_CONCURRENCY,
    async (entry) => {
      try {
        const file = await fetchMtgjsonDeck(entry.fileName);
        const verdict = classifyPrecon(file);
        if (!verdict.ok) {
          return {
            ok: false,
            code: entry.code,
            skipped: {
              code: file.code,
              name: file.name,
              type: file.type,
              rejection: verdict,
            },
          };
        }
        const decklistText = buildDecklistText(file);
        return {
          ok: true,
          batch: {
            code: file.code,
            name: file.name,
            releaseDate: file.releaseDate,
            type: file.type,
            contentHash: hashDeckContent(decklistText),
            decklistText,
          },
        };
      } catch (err) {
        return { ok: false, code: entry.code, err };
      }
    },
  );

  const successes: PreconDeckBatch[] = [];
  const skips: SkipDetail[] = [];
  let failedFetches = 0;
  for (const r of results) {
    if (r.ok) {
      successes.push(r.batch);
    } else if ("skipped" in r) {
      skips.push(r.skipped);
    } else {
      failedFetches += 1;
      logWarn(
        { source: "precon.steps", runId, deckCode: r.code },
        "mtgjson deck fetch failed",
        r.err,
      );
    }
  }

  logSkipSummary(runId, skips);
  logUnknownTypes(runId, successes);

  let batchIndex = 0;
  for (let i = 0; i < successes.length; i += BATCH) {
    await storage.writeBatch(runId, batchIndex++, successes.slice(i, i + BATCH));
  }
  return {
    totalBatches: batchIndex,
    failedFetches,
    skippedNonPlayable: skips.length,
  };
}

// Per-run audit. Logs each skipped deck individually so anything that should
// have been kept can be fished out of logs by name, and emits a grouped summary
// for at-a-glance review of which types are getting filtered.
function logSkipSummary(runId: string, skips: SkipDetail[]): void {
  if (skips.length === 0) return;

  for (const s of skips) {
    logInfo(
      {
        source: "precon.steps",
        runId,
        deckCode: s.code,
        deckName: s.name,
        deckType: s.type,
        reason: s.rejection.reason,
        cardCount: s.rejection.cardCount,
      },
      "precon skipped",
    );
  }

  const byTypeAndReason = new Map<string, number>();
  for (const s of skips) {
    const key = `${s.rejection.reason}:${s.type}`;
    byTypeAndReason.set(key, (byTypeAndReason.get(key) ?? 0) + 1);
  }
  const grouped = Array.from(byTypeAndReason, ([key, count]) => {
    const [reason, ...typeParts] = key.split(":");
    return { reason, type: typeParts.join(":"), count };
  }).sort((a, b) => b.count - a.count);

  logInfo(
    { source: "precon.steps", runId, totalSkipped: skips.length, grouped },
    "precon skip summary",
  );
}

// Surface mtgjson `type` strings we've never seen before (not in TYPE_MAP and
// not in the denylist). These got ingested under CASUAL — if a wave of new
// product type X appears, that's a signal to either map it to a real Format
// or add it to the denylist.
type UnknownTypeSink = { type: string; sampleName: string; sampleCode: string };
function logUnknownTypes(runId: string, accepted: PreconDeckBatch[]): void {
  const seen = new Map<string, UnknownTypeSink>();
  for (const b of accepted) {
    if (mapMtgjsonTypeToFormat(b.type) !== Format.CASUAL) continue;
    if (seen.has(b.type)) continue;
    seen.set(b.type, { type: b.type, sampleName: b.name, sampleCode: b.code });
  }
  if (seen.size === 0) return;
  logInfo(
    {
      source: "precon.steps",
      runId,
      unknownTypes: Array.from(seen.values()),
    },
    "precon accepted with unmapped type (defaulted to CASUAL)",
  );
}

// MTGJSON `releaseDate` is "YYYY-MM-DD". Parse as midnight UTC; the column
// is `DATE` so the time component is dropped on write. Bad strings → null.
function parseReleaseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function recordFailure(input: {
  externalId: string;
  reason: string;
  details: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.ingestDeckFailure.upsert({
    where: {
      source_externalId: {
        source: MTGJSON_ORIGIN,
        externalId: input.externalId,
      },
    },
    create: {
      source: MTGJSON_ORIGIN,
      externalId: input.externalId,
      reason: input.reason,
      details: input.details,
      resolved: false,
    },
    update: {
      reason: input.reason,
      details: input.details,
      resolved: false,
    },
  });
}

async function markFailureResolved(externalId: string): Promise<void> {
  await prisma.ingestDeckFailure.updateMany({
    where: { source: MTGJSON_ORIGIN, externalId, resolved: false },
    data: { resolved: true },
  });
}

type PerDeckOutcome =
  | { kind: "unchanged" }
  | { kind: "inserted" }
  | { kind: "updated" }
  | { kind: "failed"; unmatched: number };

async function upsertPreconDeck(
  input: PreconDeckBatch,
): Promise<PerDeckOutcome> {
  const externalKey = {
    externalSource: MTGJSON_ORIGIN,
    externalId: input.code,
  };

  const releasedAt = parseReleaseDate(input.releaseDate);

  const existing = await prisma.deck.findUnique({
    where: { externalSource_externalId: externalKey },
    select: { id: true, externalVersion: true, releasedAt: true },
  });

  if (existing && existing.externalVersion === input.contentHash) {
    // Lazy backfill for rows ingested before `releasedAt` existed.
    if (existing.releasedAt === null && releasedAt !== null) {
      await prisma.deck.update({
        where: { id: existing.id },
        data: { releasedAt },
      });
    }
    return { kind: "unchanged" };
  }

  const deck = await prisma.deck.upsert({
    where: { externalSource_externalId: externalKey },
    create: {
      userId: WOTC_USER_ID,
      name: input.name,
      format: mapMtgjsonTypeToFormat(input.type),
      visibility: Visibility.PUBLIC,
      ...externalKey,
      externalVersion: input.contentHash,
      releasedAt,
    },
    update: {
      name: input.name,
      format: mapMtgjsonTypeToFormat(input.type),
      externalVersion: input.contentHash,
      releasedAt,
    },
  });

  const result = await intakeDecklist({
    deckId: deck.id,
    userId: WOTC_USER_ID,
    text: input.decklistText,
    mode: "replace",
    applyOptions: { skipRevision: true, skipCacheInvalidation: true },
  });

  if (result.unmatchedNames.length > 0) {
    // Roll the externalVersion back so the next run retries this deck once
    // Scryfall catches up and the names resolve.
    await prisma.deck.update({
      where: { id: deck.id },
      data: { externalVersion: null },
    });
    await recordFailure({
      externalId: input.code,
      reason: "unmatched_cards",
      details: { unmatched: result.unmatchedNames },
    });
    return { kind: "failed", unmatched: result.unmatchedNames.length };
  }

  await markFailureResolved(input.code);
  return existing ? { kind: "updated" } : { kind: "inserted" };
}

// Per-batch progress entry written to the `progress` namespaced stream so
// ops (and the `/api/ingest/[runId]/progress` route) can read live precon
// state via `Run.getReadable({ namespace: "progress" })`. Mirrors the
// scryfall `ProgressEntry`. See
// `node_modules/workflow/docs/foundations/streaming.mdx` (lines 218–289) and
// `node_modules/workflow/docs/api-reference/workflow/get-writable.mdx`.
type PreconProgressEntry = {
  batchIndex: number;
  totalBatches: number;
  stats: PreconBatchStats;
  ts: string;
};

// Best-effort emit. If we're not in a live workflow context (unit tests,
// direct invocation) `getWritable()` throws — swallow it so progress
// telemetry never blocks ingestion.
async function emitPreconProgress(
  entry: Omit<PreconProgressEntry, "ts">,
): Promise<void> {
  let writer: WritableStreamDefaultWriter<PreconProgressEntry> | undefined;
  try {
    writer = getWritable<PreconProgressEntry>({
      namespace: "progress",
    }).getWriter();
  } catch (err) {
    logWarn(
      { source: "precon.steps", batchIndex: entry.batchIndex },
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

// `totalBatches` is optional so unit tests and any caller that doesn't track
// it can still call `upsertPreconBatch(runId, index)`. When omitted the
// progress entry reports `totalBatches: 0`, signalling "unknown".
export async function upsertPreconBatch(
  runId: string,
  index: number,
  totalBatches?: number,
): Promise<PreconBatchStats> {
  "use step";
  const storage = getBatchStorage<PreconDeckBatch>("precon");
  const decks = await storage.readBatch(runId, index);
  const stats = emptyPreconStats();

  for (const deck of decks) {
    try {
      const outcome = await upsertPreconDeck(deck);
      switch (outcome.kind) {
        case "inserted":
          stats.decksInserted += 1;
          break;
        case "updated":
          stats.decksUpdated += 1;
          break;
        case "unchanged":
          stats.decksUnchanged += 1;
          break;
        case "failed":
          stats.decksFailed += 1;
          stats.cardsUnmatched += outcome.unmatched;
          break;
      }
    } catch (err) {
      stats.decksFailed += 1;
      logWarn(
        { source: "precon.steps", runId, deckCode: deck.code },
        "precon upsert failed",
        err,
      );
      // Roll the externalVersion back so the next run retries this deck.
      // The deck row may already exist (upsert ran before intake threw);
      // without this, the next run sees a matching hash and skips.
      try {
        await prisma.deck.updateMany({
          where: {
            externalSource: MTGJSON_ORIGIN,
            externalId: deck.code,
          },
          data: { externalVersion: null },
        });
      } catch (rollbackErr) {
        logWarn(
          { source: "precon.steps", runId, deckCode: deck.code },
          "precon externalVersion rollback failed",
          rollbackErr,
        );
      }
      try {
        await recordFailure({
          externalId: deck.code,
          reason: "exception",
          details: {
            message: err instanceof Error ? err.message : String(err),
          },
        });
      } catch (recordErr) {
        logWarn(
          { source: "precon.steps", runId, deckCode: deck.code },
          "precon failure record write failed",
          recordErr,
        );
      }
    }
  }

  await emitPreconProgress({
    batchIndex: index,
    totalBatches: totalBatches ?? 0,
    stats,
  });
  return stats;
}

// `totalBatches` is retained but optional for backwards compatibility.
// The full fix for orphan blobs when `downloadAndStagePrecons` crashes
// mid-flight requires the storage backends (`lib/staging/{local,blob,s3}.ts`)
// to list-and-delete by `runId` prefix instead of trusting the caller's
// count — that's deferred to Phase 3 (see `docs/workflow-audit.md`,
// Dimension 2 / Dimension 4 deferred items). Until then, callers that have
// a non-zero `totalBatches` should still pass it so deterministic-key
// cleanup runs.
export async function cleanupPreconStaging(
  runId: string,
  totalBatches?: number,
): Promise<void> {
  "use step";
  const storage = getBatchStorage<PreconDeckBatch>("precon");
  await storage.cleanup(runId, totalBatches ?? 0);
}

export async function invalidateDeckDiscoveryCache(): Promise<void> {
  "use step";
  revalidateTag(publicDecksTag(), "max");
  revalidateTag(userDecksTag(WOTC_USER_ID), "max");
}

// Atomic checkpoint+invalidate. Mirrors `commitScryfallCheckpoint`. Doing
// these as separate steps risks the cache invalidate failing 3 retries
// after the checkpoint is already written — the next cron sees the manifest
// unchanged and skips, leaving the discovery caches stale until something
// else triggers a `revalidateTag`. Combining them into one step makes them
// transactional from the workflow's perspective: a failure rolls back the
// perceived progress, and replaying the step re-runs both safely
// (upsert + revalidate are idempotent).
//
// `writeCheckpoint` is still re-exported from `workflows/scryfall/steps`
// (and lives in `workflows/_shared/checkpoint`) for callers that want the
// raw primitive.
export async function commitPreconCheckpoint(
  source: string,
  version: string,
): Promise<void> {
  "use step";
  await prisma.ingestCheckpoint.upsert({
    where: { source },
    create: { source, updatedAt: version },
    update: { updatedAt: version },
  });
  revalidateTag(publicDecksTag(), "max");
  revalidateTag(userDecksTag(WOTC_USER_ID), "max");
}
