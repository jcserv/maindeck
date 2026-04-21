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
      include: [
        "lib/auth/actions.ts",
        "lib/auth/deck-access.ts",
        "lib/auth/session.ts",
        "lib/deck/actions.ts",
        "lib/deck/category-actions.ts",
        "lib/deck/editor-actions.ts",
        "lib/deck/import-action.ts",
        "lib/deck/printing-actions.ts",
        "lib/deck/queries.ts",
        "lib/deck/shuffle.ts",
        "lib/deck-io/resolve.ts",
        "lib/scryfall/**",
        "lib/search/card-search.ts",
        "lib/staging/**",
        "lib/validation/**",
        "workflows/scryfall/steps.ts",
      ],
      exclude: [
        "lib/generated/**",
        "lib/**/__tests__/**",
        "workflows/scryfall/__tests__/**",
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
