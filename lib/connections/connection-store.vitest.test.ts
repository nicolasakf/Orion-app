// @vitest-environment node

import { mkdtemp, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getStoredConnection,
  listConnectionSummaries,
  loadConnectionDocument,
  markConnectionVerified,
  patchConnection,
  removeConnection,
  saveConnection,
  type SaveConnectionInput,
} from "@/lib/connections/connection-store.server";
import { summarizeConnection } from "@/lib/connections/types";

let tempDirectory: string;

/** Minimal valid input, so each test only states what it actually cares about. */
function input(overrides: Partial<SaveConnectionInput> = {}): SaveConnectionInput {
  return {
    id: "google-sheets",
    toolId: "google-sheets",
    label: "Acme finance sheet",
    kind: "service_account",
    secrets: { serviceAccountJson: '{"private_key":"super-secret-value"}' },
    config: { spreadsheetId: "1AbC" },
    ...overrides,
  };
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-connections-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("connection store", () => {
  it("returns an empty document without creating a file", async () => {
    await expect(loadConnectionDocument()).resolves.toEqual({
      version: 1,
      connections: {},
    });
    await expect(listConnectionSummaries()).resolves.toEqual([]);
  });

  it("round-trips a saved connection", async () => {
    await saveConnection(input());
    const stored = await getStoredConnection("google-sheets");

    expect(stored?.label).toBe("Acme finance sheet");
    expect(stored?.secrets.serviceAccountJson).toContain("super-secret-value");
    expect(stored?.config).toEqual({ spreadsheetId: "1AbC" });
  });

  it("writes the connections file owner-only", async () => {
    await saveConnection(input());
    const stats = await stat(path.join(tempDirectory, "connections.json"));

    // Windows does not model POSIX permission bits; assert only where it applies.
    if (process.platform !== "win32") {
      expect(stats.mode & 0o777).toBe(0o600);
    }
  });

  it("never exposes secret values in a summary", async () => {
    await saveConnection(input());
    const [summary] = await listConnectionSummaries();

    expect(summary.secretKeys).toEqual(["serviceAccountJson"]);
    expect(JSON.stringify(summary)).not.toContain("super-secret-value");
    expect(JSON.stringify(summary)).not.toContain("private_key");
  });

  it("keeps non-secret config visible in a summary", async () => {
    await saveConnection(input());
    const [summary] = await listConnectionSummaries();

    // config is the half the agent must see: most connections fail for want of
    // an identifier rather than a token.
    expect(summary.config).toEqual({ spreadsheetId: "1AbC" });
  });

  it("preserves createdAt across an update but advances updatedAt", async () => {
    const first = await saveConnection(input());
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await saveConnection(input({ label: "Renamed" }));

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.label).toBe("Renamed");
    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(first.updatedAt),
    );
  });

  it("merges secrets on patch instead of replacing the record", async () => {
    await saveConnection(
      input({ kind: "oauth2", secrets: { accessToken: "a1", refreshToken: "r1" } }),
    );
    await patchConnection("google-sheets", {
      secrets: { accessToken: "a2" },
      expiresAt: Date.now() + 60_000,
    });

    const stored = await getStoredConnection("google-sheets");
    expect(stored?.secrets).toEqual({ accessToken: "a2", refreshToken: "r1" });
    expect(stored?.config).toEqual({ spreadsheetId: "1AbC" });
  });

  it("reports an elapsed OAuth expiry as expired", async () => {
    await saveConnection(input({ kind: "oauth2", secrets: { accessToken: "a1" } }));
    await patchConnection("google-sheets", { expiresAt: Date.now() - 1_000 });

    const [summary] = await listConnectionSummaries();
    expect(summary.expired).toBe(true);
  });

  it("ignores a patch against an unknown connection", async () => {
    await expect(patchConnection("missing", { label: "x" })).resolves.toBeUndefined();
  });

  it("records verification and removes connections", async () => {
    await saveConnection(input());
    const verified = await markConnectionVerified("google-sheets");
    expect(verified?.lastVerifiedAt).toBeDefined();

    await expect(removeConnection("google-sheets")).resolves.toBe(true);
    await expect(removeConnection("google-sheets")).resolves.toBe(false);
    await expect(listConnectionSummaries()).resolves.toEqual([]);
  });

  it("serializes concurrent writes without losing a connection", async () => {
    await Promise.all([
      saveConnection(input({ id: "one", label: "One" })),
      saveConnection(input({ id: "two", label: "Two" })),
      saveConnection(input({ id: "three", label: "Three" })),
    ]);

    const summaries = await listConnectionSummaries();
    expect(summaries.map((summary) => summary.id).sort()).toEqual([
      "one",
      "three",
      "two",
    ]);
  });
});

describe("summarizeConnection", () => {
  it("drops every secret value while keeping its key", () => {
    const summary = summarizeConnection({
      id: "stripe",
      toolId: "stripe",
      label: "Stripe",
      kind: "api_key",
      secrets: { apiKey: "sk_live_do_not_leak" },
      config: { accountId: "acct_1" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(summary.secretKeys).toEqual(["apiKey"]);
    expect(JSON.stringify(summary)).not.toContain("sk_live_do_not_leak");
  });
});
