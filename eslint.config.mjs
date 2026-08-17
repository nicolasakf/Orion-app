import { dirname } from "path";
import { fileURLToPath } from "url";

import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Flat ESLint config for Orion.
 *
 * `next lint` is deprecated and removed in Next 16, so `npm run lint` calls the
 * ESLint CLI directly. `eslint-config-next` still ships eslintrc-style configs,
 * which FlatCompat translates — this mirrors the create-next-app default.
 */
const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "**/dist/**",
      "logs/**",
      "tmp/**",
      "python/**",
      "public/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Underscore-prefixed bindings are the existing convention for
      // deliberately unused parameters and destructured discards.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // Migration baseline: this repo predates linting and still has ~100 `any`
      // sites, mostly in the notebook editor, assistant provider, and kernel
      // sidecar. CLAUDE.md forbids `any` in new code, so these stay visible as
      // warnings rather than being switched off — raise back to "error" once the
      // backlog is cleared.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Electron main, preload, and build hooks are CommonJS Node scripts, not
    // bundled app code.
    files: ["desktop/**/*.cjs", "scripts/**/*.cjs", "scripts/**/*.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
