import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const sharedAlias = {
  "@": resolve(__dirname, "./"),
  "server-only": resolve(__dirname, "./test/stubs/server-only.ts"),
};

export default defineConfig({
  resolve: {
    alias: sharedAlias,
  },
  test: {
    projects: [
      {
        resolve: {
          alias: sharedAlias,
        },
        test: {
          name: "server",
          environment: "node",
          setupFiles: ["./test/setup.ts"],
          include: [
            "lib/**/*.test.ts",
            "workflows/**/*.test.ts",
            "app/**/*.test.ts",
          ],
          // Integration tests live under workflows/**/__tests__/integration/
          // and run against the real workflow runtime via vitest.integration.config.ts.
          // Exclude them here so the unit run doesn't try to execute them
          // without the workflow() Vite plugin.
          exclude: [
            "node_modules/**",
            "**/*.integration.test.ts",
          ],
        },
      },
      {
        resolve: {
          alias: sharedAlias,
        },
        test: {
          name: "client",
          environment: "jsdom",
          setupFiles: ["./test/setup.client.ts"],
          include: [
            "app/**/*.test.tsx",
            "components/**/*.test.tsx",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Denylist model: new source files default into coverage. Anything we've
      // decided not to unit-test must be added to `exclude` with a reason.
      include: [
        "app/**/*.ts",
        "app/**/*.tsx",
        "lib/**/*.ts",
        "workflows/**/*.ts",
        "components/**/*.ts",
        "components/**/*.tsx",
      ],
      exclude: [
        // Generated code (Prisma client, etc.)
        "lib/generated/**",

        // Test infrastructure
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.test.tsx",

        // Pure type files — declarations only, no runtime code.
        "lib/scryfall/types.ts",
        "lib/staging/types.ts",
        "lib/card/printing-types.ts",
        "lib/card/types-meta.ts",
        "lib/deck/io/adapters/types.ts",
        "lib/deck/mutation/types.ts",

        // Next.js route shells — pages/layouts/error boundaries are exercised
        // via integration/E2E, not unit coverage.
        "app/**/page.tsx",
        "app/**/layout.tsx",
        "app/**/loading.tsx",
        "app/**/error.tsx",
        "app/global-error.tsx",

        // UI primitives — shadcn/ui copies, no behavior to unit-test.
        "components/ui/**",

        // React components — no per-component unit-coverage strategy yet.
        // Tests that exist run for behavior validation but don't gate coverage.
        "app/_components/**/*.tsx",

        // API route handlers — thin Next.js shims around lib/ code.
        "app/api/**/route.ts",
        "app/api/ingest/_handler.ts",

        // Infrastructure singletons / framework wiring — no behavior to test.
        "lib/db.ts",
        "lib/telemetry.ts",
        "lib/email/mailer.ts",
        "lib/auth/auth.ts",
        "lib/auth/client.ts",
        "lib/rate-limit/**",

        // Constants-only modules.
        "lib/deck/constants.ts",
        "lib/deck/legality/constants.ts",
        "lib/deck/io/adapters/_shared.ts",

        // Workflow orchestration shells — only `steps.ts` carries logic worth
        // unit-testing; the workflow body is covered by integration tests.
        "workflows/_shared/**",
        "workflows/precon/ingest.ts",
        "workflows/scryfall/ingest.ts",

        // TODO: write tests and remove from this list. No coverage today.
        "app/_actions/deck/export.ts",
        "app/_actions/deck/revisions.ts",
        "app/_actions/search-ai-stub.ts",
        "app/**/explore/actions.ts",
        "lib/card/queries.ts",
        "lib/search/syntax-parser.ts",
        "app/_components/deck-preview-pane-keys.ts",
        "app/_components/deck-search-matcher.ts",
        "app/_components/decklist-collapsed.ts",
        "app/_components/prefetch-image.ts",
        "app/_components/hotkeys/deck-actions-bus.ts",
        "app/_components/hotkeys/use-menu-shortcuts.ts",

        // TODO: tests exist but don't meet the 100/99 threshold. Tighten
        // tests and remove from this list (blocks the denylist from
        // ratcheting these up to the project bar).
        "workflows/precon/steps.ts",
      ],
      thresholds: {
        lines: 100,
        statements: 99,
        functions: 100,
        branches: 99,
      },
    },
  },
});
