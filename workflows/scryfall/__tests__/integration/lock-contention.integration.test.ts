/**
 * Integration tests against the real workflow runtime via `@workflow/vitest`.
 * Audit reference: docs/workflow-audit.md → D10 (smell: no integration tests).
 *
 * SCOPE — case (c): `acquireIngestLock` returns `false` when a non-stale lock
 * row already exists. The workflow short-circuits with
 * `{ skipped: true, reason: "another ingest run holds the lock" }` and
 * importantly does NOT enter the `try` block — so cleanupStaging and
 * releaseIngestLock are also not called (the existing lock holder owns
 * those side effects).
 *
 * STATUS — `it.todo` only. See the deferred-rationale block in
 * `workflows/precon/__tests__/integration/ingest-finally.integration.test.ts`
 * for the full explanation.
 *
 * Note for Phase 3: this case interacts with the (separate) refactor Agent S
 * is making to move `acquireIngestLock` inside the `try` block. The semantics
 * to assert here are about the CURRENT source — lock-not-acquired returns
 * early, no finally side effects. After Agent S's change lands, the
 * assertions will need updating to match the new contract (acquireIngestLock
 * inside try → finally always runs the release path, but release is a no-op
 * when no lock was held by us).
 */
import { describe, it } from "vitest";

describe("scryfallIngestWorkflow — lock contention (real runtime)", () => {
  it.todo(
    "returns skipped reason 'another ingest run holds the lock' when lock is held by another non-stale run",
  );

  it.todo(
    "does not call cleanupStaging or releaseIngestLock when lock acquisition fails (current source; revisit after Agent S's lock-inside-try refactor)",
  );

  it.todo(
    "steals a stale lock (older than INGEST_LOCK_STALE_MS) and proceeds with the run",
  );
});
