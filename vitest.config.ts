import path from "path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Treat `.md` imports as raw strings (mirrors Next.js webpack `asset/source`). */
function markdownRawPlugin(): Plugin {
  return {
    name: "markdown-raw",
    transform(code, id) {
      if (!id.endsWith(".md")) return null;
      return {
        code: `export default ${JSON.stringify(code)};`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), markdownRawPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.vitest.test.{ts,tsx}", "**/__tests__/**/*.vitest.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
});
