/**
 * Integration tests against the real workflow runtime via `@workflow/vitest`.
 * Audit reference: docs/workflow-audit.md → D10 (smell: no integration tests).
 *
 * SCOPE — case (b): `upsertBatch` throws a transient (non-FatalError) `Error`
 * and the workflow runtime retries the step until it succeeds. Verifies that
 *   - the retry actually happens (step body invoked >1 time on the same input),
 *   - the workflow eventually completes successfully with the final stats from
 *     the successful retry attempt,
 *   - the checkpoint is advanced after the successful retry.
 *
 * STATUS — `it.todo` only. See the deferred-rationale block in
 * `workflows/precon/__tests__/integration/ingest-finally.integration.test.ts`
 * for the full explanation. Summary: the `@workflow/vitest@4.0.5` step bundle
 * fails to load under Node 18+ ESM because of `next/cache` (no subpath export)
 * and `lib/*.js` (the source is `lib/*.ts`).
 *
 * What Phase 3 must verify once the runtime works:
 *   - workflow runtime treats `Error` (non-`FatalError`) as retryable per
 *     `node_modules/workflow/docs/api-reference/workflow/retryable-error.mdx`,
 *   - the step receives the same `runId`/`index` arguments on each retry,
 *   - retries respect the runtime's exponential backoff without exceeding the
 *     test timeout,
 *   - run.events shows two `step_started` entries and one `step_completed`
 *     for the retried step.
 */
import { describe, it } from "vitest";

describe("scryfallIngestWorkflow — upsertBatch transient retry (real runtime)", () => {
  it.todo("retries upsertBatch on transient Error and completes successfully");

  it.todo(
    "advances the scryfall checkpoint only after the retried upsertBatch succeeds",
  );
});
