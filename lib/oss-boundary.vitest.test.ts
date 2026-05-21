import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const root = process.cwd();
const runtimeRoots = ["app", "components", "contexts", "hooks", "lib"];
const ignoredDirectories = new Set(["node_modules", ".next", ".git"]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".mjs", ".cjs"]);

const forbiddenRuntimePatterns = [
  /@supabase\//,
  /\/lib\/supabase\b/,
  /\/lib\/billing\b/,
  /\/lib\/stripe\b/,
  /\/lib\/usage\b/,
  /\/lib\/auth\b/,
  /\/api\/search\b/,
  /\/api\/billing\b/,
  /\/api\/stripe\b/,
  /\/api\/usage\b/,
  /\/api\/auth\b/,
  /TAVILY_/,
  /\bTavily\b/,
  /\bsearch_usage\b/,
  /\bprofiles\b/,
  /\bbilling_subscriptions\b/,
  /\bstripe_webhook_events\b/,
];

const removedRuntimePaths = [
  "app/api/account",
  "app/api/admin",
  "app/api/auth",
  "app/api/billing",
  "app/api/bug-reports",
  "app/api/search",
  "app/api/stripe",
  "app/api/usage",
  "app/api/waitlist",
  "components/auth",
  "hooks/use-user.ts",
  "hooks/use-profile-tier.ts",
  "lib/supabase",
  "lib/billing",
  "lib/stripe",
  "lib/auth",
  "lib/usage",
  "middleware.ts",
  "supabase",
];

function walkFiles(directory: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = path.join(directory, entry);
    const stats = statSync(absolute);

    if (stats.isDirectory()) {
      results.push(...walkFiles(absolute));
      continue;
    }

    if (entry === "oss-boundary.vitest.test.ts") continue;

    if (sourceExtensions.has(path.extname(entry))) {
      results.push(absolute);
    }
  }

  return results;
}

describe("OSS runtime boundary", () => {
  test("removed hosted-app runtime paths stay absent", () => {
    const existing = removedRuntimePaths.filter((relativePath) =>
      existsSync(path.join(root, relativePath))
    );

    expect(existing).toEqual([]);
  });

  test("runtime source does not reference removed hosted-app services", () => {
    const offenders: string[] = [];

    for (const runtimeRoot of runtimeRoots) {
      const absoluteRoot = path.join(root, runtimeRoot);
      if (!existsSync(absoluteRoot)) continue;

      for (const file of walkFiles(absoluteRoot)) {
        const text = readFileSync(file, "utf8");
        for (const pattern of forbiddenRuntimePatterns) {
          if (pattern.test(text)) {
            offenders.push(`${path.relative(root, file)} matches ${pattern}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
