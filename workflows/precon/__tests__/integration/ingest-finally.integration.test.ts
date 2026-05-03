/**
 * Integration tests against the real workflow runtime via `@workflow/vitest`.
 * Audit reference: docs/workflow-audit.md → D10 (smell: no integration tests).
 *
 * SCOPE — case (a): `FatalError` from `downloadAndStagePrecons` triggers the
 * `finally` block (cleanupPreconStaging + releaseIngestLock), and the
 * checkpoint stays at its prior value.
 *
 * STATUS — `it.todo` only. See "Why deferred" below.
 *
 * ─── Why deferred (Phase 3 owner: please address before unskipping) ───
 *
 * The `@workflow/vitest@4.0.5` rollup builder generates an externalized step
 * bundle at `.workflow-vitest/steps.mjs` whose externals are emitted as bare
 * specifiers without ESM-required `.js` extensions, e.g.
 *
 *     import { revalidateTag } from "next/cache";
 *     import { prisma as prisma2 } from "../lib/db.js";
 *
 * Two structural problems block in-process execution:
 *
 *   1. `next/cache` — Next.js does not declare a `./cache` subpath in its
 *      package `exports`, and Node 18+ ESM strict resolution refuses to
 *      add `.js` automatically. The bundle import throws ERR_MODULE_NOT_FOUND.
 *
 *   2. `../lib/db.js` — the file on disk is `lib/db.ts`. The builder's
 *      `rewriteTsExtensions: true` rewrites our own source's `.ts` imports
 *      to `.js`, but the actual `.ts` files cannot be loaded by Node ESM
 *      without a TypeScript loader hook. There is no such hook registered
 *      for the dynamically-imported step bundle (vitest's transform does
 *      not apply to `import(pathToFileURL(...))`).
 *
 * Per the workflow testing docs (node_modules/workflow/docs/testing/index.mdx),
 * `vi.mock()` does not work inside workflow functions either, and even for
 * step functions the mock is not picked up because the bundled step file is
 * loaded via dynamic `import()` outside vitest's module graph.
 *
 * Fixing this requires one of:
 *   - A Node ESM loader hook in setupFiles that (a) rewrites `next/cache` →
 *     `next/cache.js` and (b) compiles `.ts` files on-the-fly (e.g. via
 *     `@swc-node/register`, `tsx/esm`, or a custom hook backed by `@swc/core`).
 *     This is non-trivial and was judged out of scope for Wave A.
 *   - An upstream fix in `@workflow/vitest` to either compile-and-bundle TS
 *     externals or to set `setupWorkflowTests({ compileExternals: true })`.
 *   - A different test strategy (e.g. server-based testing per
 *     node_modules/workflow/docs/testing/server-based.mdx, which spawns a
 *     Next.js dev server — but that defeats the purpose of fast in-process
 *     integration tests).
 *
 * The unit tests at `workflows/precon/__tests__/ingest.test.ts` already
 * cover this case at the orchestration level (the workflow body runs as a
 * plain async function with `vi.mock("../steps", ...)` mocks installed).
 * What's missing — and what Phase 3 needs to add once the runtime works —
 * is verification that:
 *   - the *real* workflow runtime catches `FatalError` and treats it as
 *     terminal (no retry, no replay), and
 *   - the `finally` block in the workflow body still runs to completion,
 *     recording the cleanup and lock release as observable events on the
 *     run's event log.
 */
import { describe, it } from "vitest";

describe("preconIngestWorkflow — FatalError finally semantics (real runtime)", () => {
  it.todo(
    "propagates FatalError from downloadAndStagePrecons but still cleans up staging and releases the lock",
  );

  it.todo(
    "does not advance the precon checkpoint when downloadAndStagePrecons throws FatalError",
  );
});
