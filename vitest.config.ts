import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "lib/scryfall/**",
        "lib/staging/**",
        "workflows/scryfall/steps.ts",
      ],
      exclude: [
        "lib/generated/**",
        "lib/scryfall/**/__tests__/**",
        "lib/staging/**/__tests__/**",
        "workflows/scryfall/__tests__/**",
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
});
