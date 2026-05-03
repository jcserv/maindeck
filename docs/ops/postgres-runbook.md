# Postgres Operations Runbook

Reference for the operator. Each section is terse by design — expand inline if you add findings.

---

## 1. Connection & pool

- Neon `max_connections = 450`.
- `DB_POOL_MAX` defaults to 3 on Vercel (`IS_VERCEL=true`) and 10 in dev (`lib/db.ts:15`). No PgBouncer in path.
- Headroom: each concurrent Vercel function instance opens its own pool. At 3 connections × N concurrent instances, the ceiling is 450 / 3 = 150 concurrent instances before connection pressure starts. Watch Neon's active-connection graph under load.
- No action needed now. Revisit if p99 latency spikes correlate with connection wait times; at that point, add PgBouncer or Neon's connection pooler.

---

## 2. Enable pg_stat_statements

`shared_preload_libraries` already includes `pg_stat_statements` (verified via prod `pg_settings`). The extension itself is not yet created in `neondb`. Run once:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

After enabling, the Neon dashboard's "Query Performance" tab starts populating. Alternatively query directly:

```sql
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

---

## 3. Index usage audit

Query:

```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC, tablename, indexname;
```

Drop criterion: `idx_scan = 0` AND Neon compute has been up ≥ 7 days continuously AND rolling traffic baseline confirms the code path is exercised. **Neon compute restarts reset all `pg_stat_*` counters** — a single cold start invalidates the audit window entirely. Never drop based on a short observation window.

---

## 4. Hot-path EXPLAIN battery

Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` for each query after a warm cache period:

| Query | File:line |
|---|---|
| Card name search — 1-token (e.g. `"bolt"`) | `lib/search/card-search.ts:49` |
| Card name search — 4-token (e.g. `"sol ring ramp elf"`) | `lib/search/card-search.ts:111` |
| `getDeckById` | `lib/deck/queries.ts:404` |
| `getPublicDecksWithPreview` with `?page=2` | `lib/deck/queries.ts:279` |
| Diff upsert — Card batch insert + update loop | `workflows/scryfall/steps.ts:213–240` |
| Diff upsert — Printing batch insert + update loop | `workflows/scryfall/steps.ts:283–305` |

Look for: seq scans on `card` or `printing` during Diff, bitmap heap scans on `deck_card` without `deck_card_deck_id_zone_idx`, and nested-loop re-scans on the public-deck pagination past page 1.

---

## 5. Autovacuum tuning

Do **not** set these now. Revisit when `n_live_tup > 500k` on `card` or `printing` (check via `pg_stat_user_tables`).

`card` and `printing` are the Diff churn tables — every Scryfall ingest run updates a large fraction of rows. Default `autovacuum_vacuum_scale_factor = 0.2` means vacuum fires after 20% of the table changes; at 500k+ rows that is 100k rows between vacuums, which risks table bloat.

Suggested table-level overrides once the threshold is met:

```sql
ALTER TABLE card SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);

ALTER TABLE printing SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);
```

---

## 6. REINDEX cadence

`card_name_trgm_idx` (GIN, pg_trgm) and `card_search_tsv_idx` (GIN, tsvector) bloat under frequent updates because GIN pending lists accumulate between fastupdate flushes. After any heavy Diff run (full Scryfall reload), check index bloat and reindex if needed:

```sql
REINDEX INDEX CONCURRENTLY card_name_trgm_idx;
REINDEX INDEX CONCURRENTLY card_search_tsv_idx;
```

`CONCURRENTLY` avoids a table lock. Run during off-peak (outside the 10:00 UTC ingest window in `vercel.json:4`). No fixed cadence — trigger on observed bloat or after a forced full-reload ingest.

---

## 7. Migration deploy ritual

For migrations with a manual-CONCURRENTLY recipe (e.g. `20260421010000_perf_indices/migration.sql:4–31`, `20260501010000_deck_card_allow_multi_printing/migration.sql:9–15`):

1. Apply the CONCURRENTLY SQL manually:
   ```bash
   psql "$DATABASE_URL" <<'SQL'
   -- paste manual recipe from migration comment
   SQL
   ```
2. Mark the migration applied so Prisma skips it:
   ```bash
   pnpm prisma migrate resolve --applied <migration_name>
   ```
3. Run the wrapped deploy — it no-ops the already-resolved migration cleanly:
   ```bash
   pnpm db:migrate:deploy
   ```

`pnpm db:migrate:deploy` sets `PGOPTIONS='-c lock_timeout=5s -c statement_timeout=600000ms'` before spawning `prisma migrate deploy` (`package.json`). The `lock_timeout` fails fast if a migration contends on a hot table (e.g. `card` during peak traffic); `statement_timeout` of 10 min covers `VALIDATE CONSTRAINT` on large tables.

---

## 8. Slow-query observability

Currently `log_min_duration_statement = -1` (logging disabled). Recommended: set to `200` (ms) to capture queries slower than 200 ms.

On some Neon plans the dashboard surfaces slow-query data without DB config — check the "Query Performance" tab first. If not available, set via Neon console → Parameters → `log_min_duration_statement = 200`.

After enabling `pg_stat_statements` (§2), the `pg_stat_statements` view is a lower-overhead alternative for identifying the slowest queries by total execution time.

---

## 9. Deferred audit findings

| Finding | Re-evaluation criteria |
|---|---|
| **P2-A**: zero-scan indexes (`deck_user_id_idx`, `deck_card_deck_id_idx` were already dropped; watch for others) | Re-audit after ≥ 7 days of continuous Neon compute uptime |
| **P2-B**: redundant single-column indexes superseded by composites | Same as P2-A; confirm via `pg_stat_user_indexes` |
| **P2-D**: `Card.legalities` queried by inner key — cleared; no JSON operator queries found in lib/ | No action; re-check if a format-filter feature ships |
| **P2-E**: `pg_stat_statements` not yet active | Resolved by §2 |
| **P2-F**: pool headroom at scale | Revisit if concurrent Vercel function count exceeds ~100 |

---

## 10. Last ingest concern

`ingest_checkpoint` shows `source = 'scryfall:default_cards'` last ran **2026-04-27**, approximately 6 days stale at time of audit. Two possible causes:

- The daily cron (`vercel.json:4–6`, schedule `0 10 * * *`) is not firing — check Vercel dashboard → Cron Jobs for recent executions and errors.
- The Scryfall **Bulk manifest** `updatedAt` has not moved since 2026-04-27 — the ingest workflow skips a run when the manifest `updatedAt` matches the stored **Checkpoint** (`lib/scryfall/diff.ts`). Verify by fetching `https://api.scryfall.com/bulk-data` and comparing `updated_at` on the `default_cards` entry to the checkpoint row.

If the cron is firing but Scryfall hasn't published a new bulk export, no action is needed. If the cron is silently failing, check Vercel function logs for the `/api/ingest` route.
