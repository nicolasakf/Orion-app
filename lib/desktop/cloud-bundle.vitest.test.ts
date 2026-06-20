import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it } from "vitest";

import { isOrionCloudConfiguredInAppBundle } from "./cloud-bundle";

describe("isOrionCloudConfiguredInAppBundle", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("returns true when env and client bundles include Orion Cloud markers", () => {
    tempDir = mkdtempSync(join(tmpdir(), "orion-cloud-bundle-"));
    writeFileSync(
      join(tempDir, ".env"),
      [
        "NEXT_PUBLIC_ORION_API_BASE_URL=https://app.orion-agent.ai",
        "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test",
      ].join("\n"),
      "utf8"
    );

    const chunksDir = join(tempDir, ".next", "static", "chunks", "app");
    mkdirSync(chunksDir, { recursive: true });
    writeFileSync(
      join(chunksDir, "page.js"),
      "const api = 'https://app.orion-agent.ai'; const supabase = 'https://example.supabase.co';",
      "utf8"
    );

    expect(isOrionCloudConfiguredInAppBundle(tempDir)).toBe(true);
  });

  it("returns false when client bundles omit Orion Cloud markers", () => {
    tempDir = mkdtempSync(join(tmpdir(), "orion-cloud-bundle-"));
    writeFileSync(
      join(tempDir, ".env"),
      [
        "NEXT_PUBLIC_ORION_API_BASE_URL=https://app.orion-agent.ai",
        "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test",
      ].join("\n"),
      "utf8"
    );

    const chunksDir = join(tempDir, ".next", "static", "chunks", "app");
    mkdirSync(chunksDir, { recursive: true });
    writeFileSync(join(chunksDir, "page.js"), "console.log('no cloud');", "utf8");

    expect(isOrionCloudConfiguredInAppBundle(tempDir)).toBe(false);
  });
});
