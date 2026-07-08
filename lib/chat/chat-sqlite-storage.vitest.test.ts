// @vitest-environment node

import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearChats,
  closeChatDatabase,
  deleteChat,
  getChat,
  getChatCostSummary,
  getChatDatabase,
  getChatMetas,
  getChats,
  getEditCheckpointByRequestId,
  getEditCheckpointsForChat,
  insertModelUsage,
  interruptOpenEditCheckpoints,
  recordEditCheckpointTarget,
  resolveOrCreateChatSession,
  resolveOrCreateModelRequest,
  saveChat,
  updateEditCheckpointStatus,
  updateChatSessionStatus,
  updateCompactionSummary,
} from "@/lib/chat/chat-sqlite-storage.server";
import type { ChatWire } from "@/lib/chat/chat-types";
import type { OrionDatabase } from "@/lib/chat/sqlite-adapter";

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

    expect(migratedDb.pragma("user_version", { simple: true })).toBe(3);
    await expect(getChat("chat-1")).resolves.toMatchObject({
      id: "chat-1",
      messages: [{ id: "message-1" }],
      subagentSessions: { "tool-call-1": { label: "Analysis" } },
    });
    expect(tableExists(migratedDb, "chat_session")).toBe(true);
    expect(tableExists(migratedDb, "model_request")).toBe(true);
    expect(tableExists(migratedDb, "model_usage")).toBe(true);
    expect(tableExists(migratedDb, "edit_checkpoint")).toBe(true);
    expect(tableExists(migratedDb, "edit_checkpoint_target")).toBe(true);
    expect(indexExists(migratedDb, "model_usage_request_id_idx")).toBe(true);
  });

  it("creates the full schema on a fresh database", async () => {
    const db = await getChatDatabase();

    expect(db.pragma("user_version", { simple: true })).toBe(3);
    expect(tableExists(db, "chats")).toBe(true);
    expect(tableExists(db, "chat_messages")).toBe(true);
    expect(tableExists(db, "subagent_sessions")).toBe(true);
    expect(tableExists(db, "chat_session")).toBe(true);
    expect(tableExists(db, "model_request")).toBe(true);
    expect(tableExists(db, "model_usage")).toBe(true);
    expect(tableExists(db, "edit_checkpoint")).toBe(true);
    expect(tableExists(db, "edit_checkpoint_target")).toBe(true);
    expect(columnExists(db, "chats", "forked_from_json")).toBe(true);
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

  it("round-trips fork metadata in full and metadata-only reads", async () => {
    await saveChat(
      createChat({
        forkedFrom: {
          sourceChatId: "source-chat",
          sourceMessageId: "source-message",
          sourceMessageIndex: 2,
          mode: "edit_resend",
          createdAt: "2026-05-19T12:02:00.000Z",
        },
      })
    );

    await expect(getChat("chat-1")).resolves.toMatchObject({
      forkedFrom: {
        sourceChatId: "source-chat",
        sourceMessageId: "source-message",
        sourceMessageIndex: 2,
        mode: "edit_resend",
      },
    });
    await expect(getChatMetas()).resolves.toMatchObject([
      {
        id: "chat-1",
        forkedFrom: {
          sourceChatId: "source-chat",
          sourceMessageId: "source-message",
        },
      },
    ]);
  });

  it("migrates schema version 2 databases to add fork metadata", async () => {
    const dbPath = path.join(tempDirectory, "orion.db");
    const versionTwoDb = new Database(dbPath);
    versionTwoDb.exec(`
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
      create table chat_session (
        id text primary key,
        local_chat_id text not null unique,
        status text not null default 'idle',
        created_at text not null,
        updated_at text not null
      );
      create table model_request (
        id text primary key,
        chat_session_id text,
        origin text not null,
        created_at text not null
      );
      create table model_usage (
        id text primary key,
        request_id text,
        model_id text not null,
        provider_id text not null,
        tokens_in integer,
        tokens_out integer,
        cost_usd real,
        cache_read_tokens integer,
        cache_creation_tokens integer,
        reasoning_tokens integer,
        is_byok integer not null default 0
      );
      create table edit_checkpoint (
        id text primary key,
        request_id text not null unique,
        local_chat_id text,
        status text not null default 'open',
        summary text,
        created_at text not null,
        updated_at text not null
      );
      create table edit_checkpoint_target (
        id text primary key,
        checkpoint_id text not null,
        kind text not null,
        operation text not null,
        path text not null,
        target_id text,
        before_json text not null,
        after_json text not null,
        before_hash text,
        after_hash text,
        first_tool_call_id text,
        last_tool_call_id text,
        created_at text not null,
        updated_at text not null
      );
      pragma user_version = 2;
    `);
    versionTwoDb.close();

    const migratedDb = await getChatDatabase();

    expect(migratedDb.pragma("user_version", { simple: true })).toBe(3);
    expect(columnExists(migratedDb, "chats", "forked_from_json")).toBe(true);
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

  it("summarizes model cost by local chat session", async () => {
    const session = await resolveOrCreateChatSession("chat-1");
    const firstRequest = await resolveOrCreateModelRequest({
      id: "request-1",
      origin: "user",
      chatSessionId: session?.sessionId,
    });
    const secondRequest = await resolveOrCreateModelRequest({
      id: "request-2",
      origin: "compaction",
      chatSessionId: session?.sessionId,
    });
    const otherSession = await resolveOrCreateChatSession("chat-2");
    const otherRequest = await resolveOrCreateModelRequest({
      id: "request-other",
      origin: "user",
      chatSessionId: otherSession?.sessionId,
    });

    await insertModelUsage({
      requestId: firstRequest.requestId,
      modelId: "gpt-5.5",
      providerId: "openai",
      tokensIn: 100,
      tokensOut: 25,
      costUsd: 0.001,
      isByok: true,
    });
    await insertModelUsage({
      requestId: secondRequest.requestId,
      modelId: "gpt-5.5",
      providerId: "openai",
      tokensIn: 200,
      tokensOut: 50,
      costUsd: 0.002,
      isByok: true,
    });
    await insertModelUsage({
      requestId: secondRequest.requestId,
      modelId: "gpt-5.5",
      providerId: "openai",
      tokensIn: 50,
      tokensOut: 10,
      costUsd: 0.0005,
      isByok: true,
    });
    await insertModelUsage({
      requestId: secondRequest.requestId,
      modelId: "claude-sonnet-4-6",
      providerId: "anthropic",
      tokensIn: 300,
      tokensOut: 75,
      costUsd: null,
      isByok: true,
    });
    await insertModelUsage({
      requestId: otherRequest.requestId,
      modelId: "gpt-5.5",
      providerId: "openai",
      tokensIn: 999,
      tokensOut: 999,
      costUsd: 10,
      isByok: true,
    });

    await expect(getChatCostSummary("chat-1")).resolves.toEqual({
      totalCostUsd: 0.0035,
      requestCount: 2,
      unknownCostRequestCount: 1,
      models: [
        {
          modelId: "gpt-5.5",
          providerId: "openai",
          requestCount: 2,
          totalCostUsd: 0.0035,
          unknownCostRequestCount: 0,
        },
        {
          modelId: "claude-sonnet-4-6",
          providerId: "anthropic",
          requestCount: 1,
          totalCostUsd: null,
          unknownCostRequestCount: 1,
        },
      ],
    });
  });

  it("excludes title generation requests from chat cost summaries", async () => {
    const session = await resolveOrCreateChatSession("chat-title-cost");
    const userRequest = await resolveOrCreateModelRequest({
      id: "request-user",
      origin: "user",
      chatSessionId: session?.sessionId,
    });
    const titleRequest = await resolveOrCreateModelRequest({
      id: "request-title",
      origin: "title_generation",
      chatSessionId: session?.sessionId,
    });

    await insertModelUsage({
      requestId: userRequest.requestId,
      modelId: "gpt-5.5",
      providerId: "openai",
      tokensIn: 100,
      tokensOut: 25,
      costUsd: 0.001,
      isByok: true,
    });
    await insertModelUsage({
      requestId: titleRequest.requestId,
      modelId: "gpt-4o-mini",
      providerId: "openai",
      tokensIn: 50,
      tokensOut: 10,
      costUsd: 0.0002,
      isByok: true,
    });

    await expect(getChatCostSummary("chat-title-cost")).resolves.toEqual({
      totalCostUsd: 0.001,
      requestCount: 1,
      unknownCostRequestCount: 0,
      models: [
        {
          modelId: "gpt-5.5",
          providerId: "openai",
          requestCount: 1,
          totalCostUsd: 0.001,
          unknownCostRequestCount: 0,
        },
      ],
    });
  });

  it("records and coalesces repeated text file edits for one request", async () => {
    await recordEditCheckpointTarget({
      requestId: "request-1",
      localChatId: "chat-1",
      toolCallId: "tool-1",
      kind: "text_file",
      operation: "update",
      path: "script.py",
      before: { content: "a = 1\n" },
      after: { content: "a = 2\n" },
    });
    await recordEditCheckpointTarget({
      requestId: "request-1",
      localChatId: "chat-1",
      toolCallId: "tool-2",
      kind: "text_file",
      operation: "update",
      path: "script.py",
      before: { content: "a = 2\n" },
      after: { content: "a = 3\n" },
    });

    const checkpoint = await getEditCheckpointByRequestId("request-1");

    expect(checkpoint).toMatchObject({
      requestId: "request-1",
      localChatId: "chat-1",
      status: "open",
    });
    expect(checkpoint?.targets).toHaveLength(1);
    expect(checkpoint?.targets[0]).toMatchObject({
      operation: "update",
      path: "script.py",
      firstToolCallId: "tool-1",
      lastToolCallId: "tool-2",
    });
    expect(JSON.parse(checkpoint?.targets[0]?.beforeJson ?? "{}")).toEqual({
      content: "a = 1\n",
    });
    expect(JSON.parse(checkpoint?.targets[0]?.afterJson ?? "{}")).toEqual({
      content: "a = 3\n",
    });
  });

  it("coalesces notebook insert-delete as a net no-op", async () => {
    await recordEditCheckpointTarget({
      requestId: "request-1",
      localChatId: "chat-1",
      toolCallId: "tool-1",
      kind: "notebook_cell",
      operation: "insert",
      path: "analysis.ipynb",
      targetId: "cell-1",
      before: { index: 0, source: "", cell: null },
      after: { index: 0, source: "x = 1", cell: { metadata: { orion: { id: "cell-1" } } } },
    });
    await recordEditCheckpointTarget({
      requestId: "request-1",
      localChatId: "chat-1",
      toolCallId: "tool-2",
      kind: "notebook_cell",
      operation: "delete",
      path: "analysis.ipynb",
      targetId: "cell-1",
      before: { index: 0, source: "x = 1", cell: { metadata: { orion: { id: "cell-1" } } } },
      after: { index: 0, source: "", cell: null },
    });

    const checkpoint = await getEditCheckpointByRequestId("request-1");

    expect(checkpoint?.targets).toEqual([]);
  });

  it("collapses existing cell edit then delete into one delete target", async () => {
    await recordEditCheckpointTarget({
      requestId: "request-1",
      localChatId: "chat-1",
      toolCallId: "tool-1",
      kind: "notebook_cell",
      operation: "update",
      path: "analysis.ipynb",
      targetId: "cell-1",
      before: { index: 0, source: "x = 1", cell: { source: ["x = 1"] } },
      after: { index: 0, source: "x = 2", cell: { source: ["x = 2"] } },
    });
    await recordEditCheckpointTarget({
      requestId: "request-1",
      localChatId: "chat-1",
      toolCallId: "tool-2",
      kind: "notebook_cell",
      operation: "delete",
      path: "analysis.ipynb",
      targetId: "cell-1",
      before: { index: 0, source: "x = 2", cell: { source: ["x = 2"] } },
      after: { index: 0, source: "", cell: null },
    });

    const target = (await getEditCheckpointByRequestId("request-1"))?.targets[0];

    expect(target).toMatchObject({
      operation: "delete",
      firstToolCallId: "tool-1",
      lastToolCallId: "tool-2",
    });
    expect(JSON.parse(target?.beforeJson ?? "{}")).toEqual({
      index: 0,
      source: "x = 1",
      cell: { source: ["x = 1"] },
    });
  });

  it("updates checkpoint status and interrupts stale open checkpoints", async () => {
    await recordEditCheckpointTarget({
      requestId: "request-1",
      localChatId: "chat-1",
      kind: "text_file",
      operation: "update",
      path: "script.py",
      before: { content: "a = 1\n" },
      after: { content: "a = 2\n" },
    });

    await updateEditCheckpointStatus("request-1", { status: "completed" });
    await expect(getEditCheckpointsForChat("chat-1")).resolves.toMatchObject([
      { requestId: "request-1", status: "completed" },
    ]);

    await recordEditCheckpointTarget({
      requestId: "request-2",
      localChatId: "chat-1",
      kind: "text_file",
      operation: "update",
      path: "other.py",
      before: { content: "b = 1\n" },
      after: { content: "b = 2\n" },
    });
    await expect(interruptOpenEditCheckpoints()).resolves.toBeGreaterThanOrEqual(1);
    await expect(getEditCheckpointByRequestId("request-2")).resolves.toMatchObject({
      status: "interrupted",
    });
  });
});

/** Returns true when a table exists in the test database. */
function tableExists(db: OrionDatabase, name: string): boolean {
  return Boolean(
    db
      .prepare("select 1 from sqlite_master where type = 'table' and name = ?")
      .get(name)
  );
}

/** Returns true when an index exists in the test database. */
function indexExists(db: OrionDatabase, name: string): boolean {
  return Boolean(
    db
      .prepare("select 1 from sqlite_master where type = 'index' and name = ?")
      .get(name)
  );
}

/** Returns true when a table column exists in the test database. */
function columnExists(db: OrionDatabase, tableName: string, columnName: string): boolean {
  const rows = db
    .prepare("select name from pragma_table_info(?)")
    .all(tableName) as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}
