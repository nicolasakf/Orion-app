// @vitest-environment node

import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clearChats,
  closeChatDatabase,
  deleteChat,
  getChat,
  getChatDatabase,
  getChatMetas,
  getChats,
  insertModelUsage,
  resolveOrCreateChatSession,
  resolveOrCreateModelRequest,
  saveChat,
  updateChatSessionStatus,
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
  it("migrates a pre-versioned chat database to schema version 1", async () => {
    const dbPath = path.join(tempDirectory, "orion.db");
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      create table chats (
        id text primary key,
        title text not null,
        created_at text not null,
        updated_at text not null,
        compaction_summary_json text
      );
      create table chat_messages (
        id text primary key,
        chat_id text not null,
        ordinal integer not null,
        role text not null,
        timestamp text not null,
        message_json text not null,
        foreign key (chat_id) references chats(id) on delete cascade
      );
      create table subagent_sessions (
        id text primary key,
        chat_id text not null,
        tool_call_id text not null,
        session_json text not null,
        created_at text not null,
        updated_at text not null,
        foreign key (chat_id) references chats(id) on delete cascade
      );
    `);
    const chat = createChat({
      subagentSessions: {
        "tool-call-1": {
          subagentType: "analysis",
          label: "Analysis",
          description: "Inspect data",
          status: "completed",
          messages: [],
          createdAt: "2026-05-19T12:00:00.000Z",
          updatedAt: "2026-05-19T12:01:00.000Z",
        },
      },
    });
    legacyDb
      .prepare("insert into chats values (?, ?, ?, ?, ?)")
      .run(chat.id, chat.title, chat.createdAt, chat.updatedAt, null);
    legacyDb
      .prepare("insert into chat_messages values (?, ?, ?, ?, ?, ?)")
      .run(
        "message-row-1",
        chat.id,
        0,
        chat.messages[0].role,
        chat.messages[0].timestamp,
        JSON.stringify(chat.messages[0])
      );
    legacyDb
      .prepare("insert into subagent_sessions values (?, ?, ?, ?, ?, ?)")
      .run(
        "session-row-1",
        chat.id,
        "tool-call-1",
        JSON.stringify(chat.subagentSessions?.["tool-call-1"]),
        "2026-05-19T12:00:00.000Z",
        "2026-05-19T12:01:00.000Z"
      );
    legacyDb.close();

    const migratedDb = await getChatDatabase();

    expect(migratedDb.pragma("user_version", { simple: true })).toBe(1);
    await expect(getChat("chat-1")).resolves.toMatchObject({
      id: "chat-1",
      messages: [{ id: "message-1" }],
      subagentSessions: { "tool-call-1": { label: "Analysis" } },
    });
    expect(tableExists(migratedDb, "chat_session")).toBe(true);
    expect(tableExists(migratedDb, "model_request")).toBe(true);
    expect(tableExists(migratedDb, "model_usage")).toBe(true);
    expect(indexExists(migratedDb, "model_usage_request_id_idx")).toBe(true);
  });

  it("creates the full schema on a fresh database", async () => {
    const db = await getChatDatabase();

    expect(db.pragma("user_version", { simple: true })).toBe(1);
    expect(tableExists(db, "chats")).toBe(true);
    expect(tableExists(db, "chat_messages")).toBe(true);
    expect(tableExists(db, "subagent_sessions")).toBe(true);
    expect(tableExists(db, "chat_session")).toBe(true);
    expect(tableExists(db, "model_request")).toBe(true);
    expect(tableExists(db, "model_usage")).toBe(true);
  });

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

  it("stores local chat sessions, model requests, and model usage rows", async () => {
    const session = await resolveOrCreateChatSession("chat-1");
    await expect(resolveOrCreateChatSession("chat-1")).resolves.toEqual(session);
    expect(session?.sessionId).toEqual(expect.any(String));

    const request = await resolveOrCreateModelRequest({
      id: "request-1",
      origin: "user",
      chatSessionId: session?.sessionId,
    });
    await expect(
      resolveOrCreateModelRequest({
        id: "request-1",
        origin: "user",
        chatSessionId: session?.sessionId,
      })
    ).resolves.toEqual(request);

    await insertModelUsage({
      requestId: request.requestId,
      modelId: "gpt-5.5",
      providerId: "openai",
      tokensIn: 100,
      tokensOut: 25,
      costUsd: 0.00125,
      cacheReadTokens: 10,
      cacheCreationTokens: 0,
      reasoningTokens: 5,
      isByok: true,
    });
    if (session) await updateChatSessionStatus(session.sessionId, "completed");

    const db = await getChatDatabase();
    const requestRow = db
      .prepare("select id, origin, chat_session_id from model_request where id = ?")
      .get("request-1");
    const usageRow = db
      .prepare(
        `
          select request_id, model_id, provider_id, tokens_in, tokens_out,
            cost_usd, cache_read_tokens, cache_creation_tokens,
            reasoning_tokens, is_byok
          from model_usage
        `
      )
      .get();
    const sessionRow = db
      .prepare("select status from chat_session where local_chat_id = ?")
      .get("chat-1");

    expect(requestRow).toMatchObject({
      id: "request-1",
      origin: "user",
      chat_session_id: session?.sessionId,
    });
    expect(usageRow).toMatchObject({
      request_id: "request-1",
      model_id: "gpt-5.5",
      provider_id: "openai",
      tokens_in: 100,
      tokens_out: 25,
      cost_usd: 0.00125,
      cache_read_tokens: 10,
      cache_creation_tokens: 0,
      reasoning_tokens: 5,
      is_byok: 1,
    });
    expect(sessionRow).toMatchObject({ status: "completed" });
  });
});

/** Returns true when a table exists in the test database. */
function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db
      .prepare("select 1 from sqlite_master where type = 'table' and name = ?")
      .get(name)
  );
}

/** Returns true when an index exists in the test database. */
function indexExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db
      .prepare("select 1 from sqlite_master where type = 'index' and name = ?")
      .get(name)
  );
}
