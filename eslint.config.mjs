import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import importPlugin from "eslint-plugin-import";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
        node: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "import/no-cycle": [
        "error",
        { maxDepth: 10, ignoreExternal: true },
      ],
      "import/no-unused-modules": [
        "warn",
        {
          unusedExports: true,
          missingExports: false,
          src: [
            "app/**/*.{ts,tsx}",
            "lib/**/*.{ts,tsx}",
            "components/**/*.{ts,tsx}",
          ],
          ignoreExports: [
            "app/**/page.tsx",
            "app/**/layout.tsx",
            "app/**/route.ts",
            "app/**/loading.tsx",
            "app/**/error.tsx",
            "app/**/global-error.tsx",
            "**/*.test.ts",
            "**/*.test.tsx",
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message:
                "Import the wrapper from '@/app/_components/link' instead. See AGENTS.md.",
            },
          ],
        },
      ],
      complexity: ["warn", 20],
      "max-lines-per-function": [
        "warn",
        { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      "max-lines": [
        "warn",
        { max: 600, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["app/_components/link.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": "off",
      complexity: "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "docs/hifi-poc/**",
    "app/.well-known",
    ".claude/**",
  ]),
]);

export default eslintConfig;
