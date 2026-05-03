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
        "app/_actions/auth.ts",
        "app/_actions/deck/categories.ts",
        "app/_actions/deck/crud.ts",
        "app/_actions/deck/import.ts",
        "app/_actions/deck/printings.ts",
        "lib/auth/deck-access.ts",
        "lib/auth/forms.ts",
        "lib/auth/session.ts",
        "lib/deck/editor-actions.ts",
        "lib/deck/forms.ts",
        "lib/deck/io/resolve.ts",
        "lib/deck/queries.ts",
        "lib/deck/shuffle.ts",
        "lib/precon/**",
        "lib/scryfall/**",
        "lib/search/card-search.ts",
        "lib/staging/**",
        "workflows/precon/steps.ts",
        "workflows/scryfall/steps.ts",
      ],
      exclude: [
        "lib/generated/**",
        "lib/**/__tests__/**",
        "workflows/precon/__tests__/**",
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
