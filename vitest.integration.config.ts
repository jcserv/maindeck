import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";

// Integration tests run workflows against the real workflow runtime
// (in-process Local World). Per the workflow testing docs
// (node_modules/workflow/docs/testing/index.mdx), `vi.mock()` only works
// inside step functions, not workflow functions — so any module the workflow
// body imports directly cannot be mocked. The `prisma` module and
// `@/lib/staging` are only consumed inside steps, so mocking them is the
// intended approach for the integration tests under
// `workflows/**/__tests__/integration/`.
//
// As of agent-a6a433369e97e4af8 (Wave A): all four planned integration tests
// (D10 cases a–d) are present as `it.todo` placeholders. The runtime cannot
// actually load the externalized step bundle at `.workflow-vitest/steps.mjs`
// without additional Node ESM loader infrastructure — see the deferred-rationale
// block in
// `workflows/precon/__tests__/integration/ingest-finally.integration.test.ts`
// for the full diagnosis. The config is wired up so the suite runs cleanly
// (zero failures, zero hangs) and Phase 3 can flesh out the cases once the
// runtime issue is resolved.
//
// Integration test files live alongside unit tests under
// `workflows/**/__tests__/integration/**/*.integration.test.ts` and are kept
// out of the default vitest run by the unit config's `**/*.integration.test.ts`
// exclude.
export default defineConfig({
  plugins: [workflow()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
      "server-only": resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
  test: {
    name: "integration",
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["workflows/**/*.integration.test.ts"],
    // Workflows take longer than typical unit tests — give the runtime room
    // to do retries, replays, and event-log polling.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
