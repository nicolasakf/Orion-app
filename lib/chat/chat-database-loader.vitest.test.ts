// @vitest-environment node

import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  isNodeSqliteAvailable,
  openChatDatabase,
  probeChatStorageAvailability,
  resetChatDatabaseLoader,
} from "@/lib/chat/chat-database-loader.server";

describe("chat database loader", () => {
  let tempDirectory: string;

  afterEach(() => {
    delete process.env.ORION_CHAT_STORAGE_DEGRADED;
    resetChatDatabaseLoader();
    if (tempDirectory) {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("prefers node:sqlite when the built-in module is available", () => {
    if (!isNodeSqliteAvailable()) {
      return;
    }

    expect(probeChatStorageAvailability()).toBe(true);
    tempDirectory = mkdtempSync(join(tmpdir(), "orion-chat-loader-"));
    const dbPath = join(tempDirectory, "orion.db");
    const db = openChatDatabase(dbPath);
    expect(db).not.toBeNull();
    db?.exec("select 1");
    db?.close();
  });

  it("marks storage degraded when startup flagged native modules unavailable", () => {
    process.env.ORION_CHAT_STORAGE_DEGRADED = "1";
    expect(probeChatStorageAvailability()).toBe(false);
    expect(openChatDatabase(join(tmpdir(), "missing.db"))).toBeNull();
  });
});
