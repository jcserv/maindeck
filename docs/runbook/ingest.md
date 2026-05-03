# Ingest Operations Runbook

Reference for the operator. Each section is terse by design — expand inline if you add findings.

Two ingest workflows run on cron from `vercel.json`:

| Path | Workflow | Schedule (UTC) |
|---|---|---|
| `/api/ingest` | `scryfallIngestWorkflow` | `0 10 * * *` (daily at 10:00) |
| `/api/ingest/precons` | `preconIngestWorkflow` | `0 11 * * *` (daily at 11:00) |

Both routes are guarded by `CRON_SECRET` (timing-safe Bearer compare in `app/api/ingest/_handler.ts`).

---

## 1. Cron success ≠ ingest success

The cron handler only awaits `start(workflow)` from `workflow/api`. `start()` enqueues a run and returns immediately with a `runId` — it does **not** wait for the workflow to finish. Vercel's cron dashboard therefore reports "succeeded" as soon as the enqueue returns, even if the actual ingest then fails or stalls.

To know whether an ingest itself succeeded, you must inspect the run separately. Three options:

1. Hit the status route (§4) — fast, JSON, suitable for external monitors.
2. `npx workflow inspect runs --workflow scryfallIngestWorkflow --status failed` — CLI listing of failed runs.
3. `npx workflow web` — open the visual dashboard, drill into the run, see step graph and errors.

See `node_modules/workflow/docs/api-reference/workflow-api/world/observability.mdx` for the underlying observability primitives the CLI / Web UI sit on top of.

---

## 2. Inspect a failed run

CLI flow:

```bash
# List recent failures for the Scryfall ingest
npx workflow inspect runs --workflow scryfallIngestWorkflow --status failed --limit 10

# Open the visual UI on a specific run
npx workflow web
# → navigate to the run by runId; the step graph shows where it failed
```

Things to check on a failed Scryfall run:

- `fetchBulkManifest` failure → Scryfall outage or DNS, retry later.
- `acquireIngestLock` returned `false` → another run still holds the lock; check for a stuck run via §4 and cancel it (`world.events.create(runId, { eventType: 'run_cancelled' })` per `node_modules/workflow/docs/api-reference/workflow-api/world/storage.mdx`).
- `upsertBatch` failure → likely Postgres pressure; cross-reference with `docs/ops/postgres-runbook.md` §1 (pool) and §10 (last ingest).

Things to check on a failed Precon run:

- `FatalError` thrown from the workflow → schema or upstream-feed format change. The error message in the run output points to the offending step.

---

## 3. Manually re-trigger a missed ingest

Both routes accept `POST` (and `GET`, for cron compatibility) with the cron bearer token:

```bash
# Scryfall ingest
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://<deployment>/api/ingest

# Precon ingest
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://<deployment>/api/ingest/precons
```

Response is `{ "runId": "<id>" }`. The run executes asynchronously — track it via §4 or `npx workflow web`.

The Scryfall workflow will short-circuit (`skipped: true, reason: "manifest unchanged"`) if the Scryfall bulk manifest's `updatedAt` matches the stored `IngestCheckpoint`. This is expected on days Scryfall did not publish a new bulk export — see `docs/ops/postgres-runbook.md` §10 for the diagnostic.

The lock-skip path (`skipped: true, reason: "another ingest run holds the lock"`) means a previous run is still in flight. Inspect it via §2 before forcing another.

---

## 4. Status route

`GET /api/ingest/status` returns the latest 5 runs per ingest workflow as JSON. No auth — it returns metadata only (no input/output payloads).

```bash
curl https://<deployment>/api/ingest/status
```

Response shape:

```json
{
  "workflows": {
    "scryfallIngestWorkflow": [
      { "runId": "...", "status": "completed", "startedAt": "...", "completedAt": "..." }
    ],
    "preconIngestWorkflow": [
      { "runId": "...", "status": "running", "startedAt": "...", "completedAt": null }
    ]
  }
}
```

`status` is one of `pending`, `running`, `completed`, `failed`, `cancelled` (per `WorkflowRunStatusSchema` in `@workflow/world`).

**Suggested monitor:** alert when the most recent `scryfallIngestWorkflow` run is `failed`, or when the most recent run is `running` and `startedAt` is older than ~30 min (the workflow normally finishes in single-digit minutes).

The route lives at `app/api/ingest/status/route.ts` and uses `getWorld().runs.list({ resolveData: 'none', sortOrder: 'desc' })` — see `node_modules/workflow/docs/api-reference/workflow-api/world/storage.mdx` for the underlying storage interface.

---

## 5. Per-batch progress stream

`GET /api/ingest/<runId>/progress` streams namespaced (`progress`) chunks emitted by `upsertBatch` while a Scryfall ingest is running. Useful for watching a long ingest from a terminal:

```bash
curl -N https://<deployment>/api/ingest/<runId>/progress
```

The route lives at `app/api/ingest/[runId]/progress/route.ts` and uses `getRun(runId).getReadable({ namespace: 'progress' })` — see `node_modules/workflow/docs/foundations/streaming.mdx` (lines 218–289) for the namespaced-stream contract.

The chunk shape is owned by the workflow; check `workflows/scryfall/steps.ts` for the current `ProgressEntry` definition.

---

## 6. Related runbooks

- `docs/ops/postgres-runbook.md` — Postgres pressure during/after ingest, autovacuum tuning on `card`/`printing`, and §10 specifically for "ingest hasn't run lately" diagnostics.
