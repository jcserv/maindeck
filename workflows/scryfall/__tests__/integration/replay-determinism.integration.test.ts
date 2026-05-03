/**
 * Integration tests against the real workflow runtime via `@workflow/vitest`.
 * Audit reference: docs/workflow-audit.md → D10 (smell: no integration tests).
 *
 * SCOPE — case (d): replay determinism. Kill the runtime mid-loop (e.g.
 * during the second `upsertBatch` call), restart from persisted state, and
 * verify the workflow produces the same final stats as a clean run.
 *
 * STATUS — `it.todo` only, with TWO independent reasons:
 *
 * 1. Same runtime-loading issue as cases (a)/(b)/(c) — see the deferred
 *    rationale in
 *    `workflows/precon/__tests__/integration/ingest-finally.integration.test.ts`.
 *
 * 2. Even with the runtime working, replay-determinism testing requires
 *    infrastructure that the `@workflow/vitest` plugin does not provide
 *    out of the box:
 *      - a way to crash a worker mid-run without losing the persisted
 *        event log (the Local World writes to `.workflow-data`, but the
 *        plugin's `setupWorkflowTests` calls `world.clear()` on every
 *        invocation — so a "restart" inside a single test run wipes the
 *        state we'd want to replay from);
 *      - a deterministic clock so the second run sees the same `Date.now()`
 *        as the first (the workflow doesn't use `Date.now()` directly
 *        today, but if any step does, it would diverge on replay);
 *      - hooks to inject the crash deterministically (e.g. fail-once-then-
 *        succeed counter that survives across the simulated restart).
 *
 *    Building this is genuinely Phase 3 / dedicated-test-infra work, not
 *    a smell-fix. The audit acknowledges this implicitly by tagging it
 *    last in the case list.
 *
 * Phase 3 owner: consider whether this case is worth the infra cost or
 * whether the existing per-step retry coverage + the FatalError finally
 * test are sufficient signal for the underlying smell.
 */
import { describe, it } from "vitest";

describe("scryfallIngestWorkflow — replay determinism (real runtime)", () => {
  it.todo(
    "produces identical final stats when killed mid-loop and replayed from persisted state",
  );
});
