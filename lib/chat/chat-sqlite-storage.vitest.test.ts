// @vitest-environment node

import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clearChats,
  closeChatDatabase,
  deleteChat,
  getChat,
  getChatMetas,
  getChats,
  saveChat,
  updateCompactionSummary,
} from "@/lib/chat/chat-sqlite-storage.server";
import type { ChatWire } from "@/lib/chat/chat-types";

let tempDirectory: string;

/** Builds a valid chat wire payload for storage tests. */
function createChat(overrides: Partial<ChatWire> = {}): ChatWire {
  const createdAt = "2026-05-19T12:00:00.000Z";
  return {
    id: "chat-1",
    title: "Test chat",
    createdAt,
    updatedAt: createdAt,
    messages: [
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        timestamp: createdAt,
      },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-chat-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  closeChatDatabase();
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("SQLite chat storage", () => {
  it("saves, lists, loads, deletes, and clears chats", async () => {
    await saveChat(createChat());

    await expect(getChats()).resolves.toHaveLength(1);
    await expect(getChat("chat-1")).resolves.toMatchObject({
      id: "chat-1",
      messages: [{ id: "message-1" }],
    });

    await deleteChat("chat-1");
    await expect(getChat("chat-1")).resolves.toBeUndefined();

    await saveChat(createChat({ id: "chat-2" }));
    await clearChats();
    await expect(getChats()).resolves.toEqual([]);
  });

  it("returns metadata without hydrating message bodies and sorts newest first", async () => {
    await saveChat(
      createChat({
        id: "older",
        title: "Older",
        updatedAt: "2026-05-18T12:00:00.000Z",
      })
    );
    await saveChat(
      createChat({
        id: "newer",
        title: "Newer",
        updatedAt: "2026-05-19T12:00:00.000Z",
      })
    );

    const metas = await getChatMetas();

    expect(metas.map((chat) => chat.id)).toEqual(["newer", "older"]);
    expect(metas.every((chat) => chat.messages.length === 0)).toBe(true);
  });

  it("updates compaction summaries without rewriting messages", async () => {
    await saveChat(createChat());

    await updateCompactionSummary("chat-1", {
      text: "Summary",
      coversThrough: "message-1",
      createdAt: "2026-05-19T12:30:00.000Z",
      model: "test-model",
      tokensSaved: 100,
    });

    const chat = await getChat("chat-1");
    expect(chat?.messages).toHaveLength(1);
    expect(chat?.compactionSummary?.text).toBe("Summary");
  });

  it("round-trips subagent sessions", async () => {
    await saveChat(
      createChat({
        subagentSessions: {
          "tool-call-1": {
            subagentType: "analysis",
            label: "Analysis",
            description: "Inspect data",
            status: "completed",
            messages: [{ id: "sub-message-1", role: "assistant", parts: [] }],
            summary: "Done",
            createdAt: "2026-05-19T12:00:00.000Z",
            updatedAt: "2026-05-19T12:01:00.000Z",
          },
        },
      })
    );

    const chat = await getChat("chat-1");
    expect(chat?.subagentSessions?.["tool-call-1"]).toMatchObject({
      label: "Analysis",
      summary: "Done",
    });
  });
});
