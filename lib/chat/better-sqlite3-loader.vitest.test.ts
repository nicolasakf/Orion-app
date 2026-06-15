// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import {
  getChatStorageDegradedReason,
  isChatStorageDegraded,
  loadBetterSqlite3,
  resetBetterSqlite3Loader,
} from "@/lib/chat/better-sqlite3-loader.server";
import {
  clearFallbackChats,
  getFallbackChats,
  resetFallbackChatStorage,
  saveFallbackChat,
} from "@/lib/chat/chat-storage-fallback.server";

describe("better-sqlite3 loader", () => {
  afterEach(() => {
    delete process.env.ORION_CHAT_STORAGE_DEGRADED;
    resetBetterSqlite3Loader();
    resetFallbackChatStorage();
  });

  it("marks storage degraded when startup flagged native modules unavailable", () => {
    process.env.ORION_CHAT_STORAGE_DEGRADED = "1";
    expect(loadBetterSqlite3()).toBeNull();
    expect(isChatStorageDegraded()).toBe(true);
    expect(getChatStorageDegradedReason()).toContain("Chat storage was unavailable");
  });
});

describe("fallback chat storage", () => {
  afterEach(() => {
    resetFallbackChatStorage();
  });

  it("stores chats in memory during degraded mode", async () => {
    await saveFallbackChat({
      id: "chat-1",
      title: "Fallback chat",
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      messages: [],
    });

    const chats = await getFallbackChats();
    expect(chats).toHaveLength(1);
    expect(chats[0]?.title).toBe("Fallback chat");

    await clearFallbackChats();
    expect(await getFallbackChats()).toEqual([]);
  });
});
