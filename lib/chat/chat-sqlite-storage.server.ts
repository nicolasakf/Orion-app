import "server-only";

import { randomUUID } from "crypto";

import Database from "better-sqlite3";

import {
  ChatWireSchema,
  CompactionSummaryWireSchema,
  type ChatWire,
} from "@/lib/chat/chat-types";
import {
  ensureOrionDataDirectory,
  getOrionDatabasePath,
} from "@/lib/local/orion-paths.server";

interface ChatRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  compaction_summary_json: string | null;
}

interface ChatMessageRow {
  message_json: string;
}

interface SubagentSessionRow {
  tool_call_id: string;
  session_json: string;
}

export type ChatSessionStatus = "idle" | "processing" | "completed" | "error";

export interface ModelUsageInsert {
  requestId?: string | null;
  modelId: string;
  providerId: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
  reasoningTokens?: number | null;
  isByok: boolean;
}

export interface ChatCostSummaryModel {
  modelId: string;
  providerId: string;
  requestCount: number;
  totalCostUsd: number | null;
  unknownCostRequestCount: number;
}

export interface ChatCostSummary {
  totalCostUsd: number | null;
  requestCount: number;
  unknownCostRequestCount: number;
  models: ChatCostSummaryModel[];
}

const CURRENT_SCHEMA_VERSION = 1;

let database: Database.Database | null = null;

/** Creates the durable chat tables that existed before SQLite schema versioning. */
function createBaseChatSchema(db: Database.Database): void {
  db.exec(`
    create table if not exists chats (
      id text primary key,
      title text not null,
      created_at text not null,
      updated_at text not null,
      compaction_summary_json text
    );

    create table if not exists chat_messages (
      id text primary key,
      chat_id text not null,
      ordinal integer not null,
      role text not null,
      timestamp text not null,
      message_json text not null,
      foreign key (chat_id) references chats(id) on delete cascade
    );

    create index if not exists chat_messages_chat_id_ordinal_idx
      on chat_messages(chat_id, ordinal);

    create table if not exists subagent_sessions (
      id text primary key,
      chat_id text not null,
      tool_call_id text not null,
      session_json text not null,
      created_at text not null,
      updated_at text not null,
      foreign key (chat_id) references chats(id) on delete cascade
    );

    create index if not exists chats_updated_at_idx on chats(updated_at);
    create index if not exists subagent_sessions_chat_id_idx on subagent_sessions(chat_id);
  `);
}

/** Adds local analogs of the hosted usage tables and marks the DB as v1. */
function migrateToVersion1(db: Database.Database): void {
  const migrate = db.transaction(() => {
    createBaseChatSchema(db);
    db.exec(`
      create table if not exists chat_session (
        id text primary key,
        local_chat_id text not null unique,
        status text not null default 'idle'
          check (status in ('idle', 'processing', 'completed', 'error')),
        created_at text not null,
        updated_at text not null
      );

      create index if not exists chat_session_processing_idx
        on chat_session(status) where status = 'processing';

      create table if not exists model_request (
        id text primary key,
        chat_session_id text,
        origin text not null,
        created_at text not null,
        foreign key (chat_session_id) references chat_session(id) on delete set null
      );

      create index if not exists model_request_chat_session_id_idx
        on model_request(chat_session_id) where chat_session_id is not null;

      create table if not exists model_usage (
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
        is_byok integer not null default 0 check (is_byok in (0, 1)),
        created_at text not null,
        foreign key (request_id) references model_request(id) on delete set null
      );

      create index if not exists model_usage_request_id_idx
        on model_usage(request_id) where request_id is not null;
      create index if not exists model_usage_created_at_idx on model_usage(created_at);
      create index if not exists model_usage_model_created_at_idx
        on model_usage(model_id, created_at);
      create index if not exists model_usage_cost_daily_idx
        on model_usage(created_at) where cost_usd is not null;

      pragma user_version = 1;
    `);
  });

  migrate();
}

/** Runs all pending local SQLite migrations in order. */
function migrateDatabase(db: Database.Database): void {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Orion database schema version ${version}. Expected ${CURRENT_SCHEMA_VERSION} or lower.`
    );
  }

  if (version < 1) {
    migrateToVersion1(db);
  }
}

/** Opens Orion's local SQLite database and initializes the chat schema. */
export async function getChatDatabase(): Promise<Database.Database> {
  if (database) return database;

  await ensureOrionDataDirectory();
  database = new Database(getOrionDatabasePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  migrateDatabase(database);

  return database;
}

/** Closes the cached SQLite connection, primarily for tests. */
export function closeChatDatabase(): void {
  database?.close();
  database = null;
}

/** Saves one complete chat, replacing message and subagent rows atomically. */
export async function saveChat(chat: ChatWire): Promise<void> {
  const parsed = ChatWireSchema.parse(chat);
  const db = await getChatDatabase();
  const transaction = db.transaction((nextChat: ChatWire) => {
    db.prepare(
      `
        insert into chats (id, title, created_at, updated_at, compaction_summary_json)
        values (@id, @title, @createdAt, @updatedAt, @compactionSummaryJson)
        on conflict(id) do update set
          title = excluded.title,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          compaction_summary_json = excluded.compaction_summary_json
      `
    ).run({
      id: nextChat.id,
      title: nextChat.title,
      createdAt: nextChat.createdAt,
      updatedAt: nextChat.updatedAt,
      compactionSummaryJson: nextChat.compactionSummary
        ? JSON.stringify(nextChat.compactionSummary)
        : null,
    });

    db.prepare("delete from chat_messages where chat_id = ?").run(nextChat.id);
    db.prepare("delete from subagent_sessions where chat_id = ?").run(nextChat.id);

    const insertMessage = db.prepare(
      `
        insert into chat_messages (id, chat_id, ordinal, role, timestamp, message_json)
        values (@id, @chatId, @ordinal, @role, @timestamp, @messageJson)
      `
    );
    nextChat.messages.forEach((message, ordinal) => {
      insertMessage.run({
        id: `${nextChat.id}:${message.id}:${ordinal}`,
        chatId: nextChat.id,
        ordinal,
        role: message.role,
        timestamp: message.timestamp,
        messageJson: JSON.stringify(message),
      });
    });

    const insertSession = db.prepare(
      `
        insert into subagent_sessions
          (id, chat_id, tool_call_id, session_json, created_at, updated_at)
        values (@id, @chatId, @toolCallId, @sessionJson, @createdAt, @updatedAt)
      `
    );
    Object.entries(nextChat.subagentSessions ?? {}).forEach(
      ([toolCallId, session]) => {
        insertSession.run({
          id: `${nextChat.id}:${toolCallId}`,
          chatId: nextChat.id,
          toolCallId,
          sessionJson: JSON.stringify(session),
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });
      }
    );
  });

  transaction(parsed);
}

/** Saves multiple chats to the local SQLite database. */
export async function saveChats(chats: ChatWire[]): Promise<void> {
  for (const chat of chats) {
    await saveChat(chat);
  }
}

/** Returns all chats, newest first. */
export async function getChats(): Promise<ChatWire[]> {
  const metas = await getChatMetas();
  const chats = await Promise.all(
    metas.map((meta) => getChat(meta.id))
  );
  return chats.filter((chat): chat is ChatWire => chat !== undefined);
}

/** Returns chat metadata with empty message arrays, newest first. */
export async function getChatMetas(): Promise<ChatWire[]> {
  const db = await getChatDatabase();
  const rows = db
    .prepare("select * from chats order by updated_at desc")
    .all() as ChatRow[];

  return rows.map((row) =>
    ChatWireSchema.parse({
      id: row.id,
      title: row.title,
      messages: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      compactionSummary: row.compaction_summary_json
        ? CompactionSummaryWireSchema.parse(JSON.parse(row.compaction_summary_json))
        : undefined,
    })
  );
}

/** Returns one complete chat by id. */
export async function getChat(chatId: string): Promise<ChatWire | undefined> {
  const db = await getChatDatabase();
  const row = db
    .prepare("select * from chats where id = ?")
    .get(chatId) as ChatRow | undefined;
  if (!row) return undefined;

  const messageRows = db
    .prepare("select message_json from chat_messages where chat_id = ? order by ordinal asc")
    .all(chatId) as ChatMessageRow[];
  const sessionRows = db
    .prepare("select tool_call_id, session_json from subagent_sessions where chat_id = ?")
    .all(chatId) as SubagentSessionRow[];

  return ChatWireSchema.parse({
    id: row.id,
    title: row.title,
    messages: messageRows.map((messageRow) => JSON.parse(messageRow.message_json)),
    subagentSessions:
      sessionRows.length > 0
        ? Object.fromEntries(
            sessionRows.map((sessionRow) => [
              sessionRow.tool_call_id,
              JSON.parse(sessionRow.session_json),
            ])
          )
        : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    compactionSummary: row.compaction_summary_json
      ? CompactionSummaryWireSchema.parse(JSON.parse(row.compaction_summary_json))
      : undefined,
  });
}

/** Deletes one chat and its dependent message/session rows. */
export async function deleteChat(chatId: string): Promise<void> {
  const db = await getChatDatabase();
  db.prepare("delete from chats where id = ?").run(chatId);
}

/** Deletes all local chat history from SQLite. */
export async function clearChats(): Promise<void> {
  const db = await getChatDatabase();
  db.prepare("delete from chats").run();
}

/** Updates or clears a chat compaction summary without rewriting messages. */
export async function updateCompactionSummary(
  chatId: string,
  summary: ChatWire["compactionSummary"] | null
): Promise<void> {
  const parsedSummary = summary
    ? CompactionSummaryWireSchema.parse(summary)
    : null;
  const db = await getChatDatabase();
  db.prepare(
    `
      update chats
      set compaction_summary_json = ?, updated_at = ?
      where id = ?
    `
  ).run(
    parsedSummary ? JSON.stringify(parsedSummary) : null,
    new Date().toISOString(),
    chatId
  );
}

/** Resolves or creates a local chat session row for usage tracking. */
export async function resolveOrCreateChatSession(
  localChatId: string | undefined,
  status: ChatSessionStatus = "processing"
): Promise<{ sessionId: string } | null> {
  if (!localChatId) return null;

  const db = await getChatDatabase();
  const now = new Date().toISOString();
  const sessionId = randomUUID();
  db.prepare(
    `
      insert into chat_session (id, local_chat_id, status, created_at, updated_at)
      values (@id, @localChatId, @status, @createdAt, @updatedAt)
      on conflict(local_chat_id) do update set
        status = excluded.status,
        updated_at = excluded.updated_at
    `
  ).run({
    id: sessionId,
    localChatId,
    status,
    createdAt: now,
    updatedAt: now,
  });

  const row = db
    .prepare("select id from chat_session where local_chat_id = ?")
    .get(localChatId) as { id: string } | undefined;

  return row ? { sessionId: row.id } : null;
}

/** Updates a local chat session status without blocking the caller on failures. */
export async function updateChatSessionStatus(
  sessionId: string,
  status: ChatSessionStatus
): Promise<void> {
  const db = await getChatDatabase();
  db.prepare(
    `
      update chat_session
      set status = ?, updated_at = ?
      where id = ?
    `
  ).run(status, new Date().toISOString(), sessionId);
}

/** Resolves or creates a model request row for one logical model invocation group. */
export async function resolveOrCreateModelRequest(options: {
  id?: string | null;
  origin: string;
  chatSessionId?: string | null;
}): Promise<{ requestId: string }> {
  const db = await getChatDatabase();
  const requestId = options.id ?? randomUUID();
  db.prepare(
    `
      insert into model_request (id, chat_session_id, origin, created_at)
      values (@id, @chatSessionId, @origin, @createdAt)
      on conflict(id) do update set
        chat_session_id = coalesce(model_request.chat_session_id, excluded.chat_session_id)
    `
  ).run({
    id: requestId,
    chatSessionId: options.chatSessionId ?? null,
    origin: options.origin,
    createdAt: new Date().toISOString(),
  });

  return { requestId };
}

/** Inserts one local model usage row. */
export async function insertModelUsage(usage: ModelUsageInsert): Promise<void> {
  const db = await getChatDatabase();
  db.prepare(
    `
      insert into model_usage (
        id,
        request_id,
        model_id,
        provider_id,
        tokens_in,
        tokens_out,
        cost_usd,
        cache_read_tokens,
        cache_creation_tokens,
        reasoning_tokens,
        is_byok,
        created_at
      ) values (
        @id,
        @requestId,
        @modelId,
        @providerId,
        @tokensIn,
        @tokensOut,
        @costUsd,
        @cacheReadTokens,
        @cacheCreationTokens,
        @reasoningTokens,
        @isByok,
        @createdAt
      )
    `
  ).run({
    id: randomUUID(),
    requestId: usage.requestId ?? null,
    modelId: usage.modelId,
    providerId: usage.providerId,
    tokensIn: usage.tokensIn ?? null,
    tokensOut: usage.tokensOut ?? null,
    costUsd: usage.costUsd ?? null,
    cacheReadTokens: usage.cacheReadTokens ?? null,
    cacheCreationTokens: usage.cacheCreationTokens ?? null,
    reasoningTokens: usage.reasoningTokens ?? null,
    isByok: usage.isByok ? 1 : 0,
    createdAt: new Date().toISOString(),
  });
}

/** Aggregates cost by usage rows, but counts distinct logical model requests. */
export async function getChatCostSummary(
  localChatId: string
): Promise<ChatCostSummary> {
  const db = await getChatDatabase();
  const rows = db
    .prepare(
      `
        select
          usage.model_id as modelId,
          usage.provider_id as providerId,
          count(distinct request.id) as requestCount,
          sum(coalesce(usage.cost_usd, 0)) as totalCostUsd,
          sum(case when usage.cost_usd is not null then 1 else 0 end) as knownCostUsageCount,
          count(distinct case when usage.cost_usd is null then request.id end) as unknownCostRequestCount
        from model_usage usage
        join model_request request on request.id = usage.request_id
        join chat_session session on session.id = request.chat_session_id
        where session.local_chat_id = ?
        group by usage.model_id, usage.provider_id
        order by totalCostUsd desc, requestCount desc, usage.model_id asc
      `
    )
    .all(localChatId) as Array<{
      modelId: string;
      providerId: string;
      requestCount: number;
      totalCostUsd: number;
      knownCostUsageCount: number;
      unknownCostRequestCount: number;
    }>;
  const totalRow = db
    .prepare(
      `
        select
          count(distinct request.id) as requestCount,
          count(distinct case when usage.id is null or usage.cost_usd is null then request.id end) as unknownCostRequestCount
        from model_request request
        join chat_session session on session.id = request.chat_session_id
        left join model_usage usage on usage.request_id = request.id
        where session.local_chat_id = ?
      `
    )
    .get(localChatId) as
    | { requestCount: number; unknownCostRequestCount: number }
    | undefined;

  const requestCount = totalRow?.requestCount ?? 0;
  const unknownCostRequestCount = totalRow?.unknownCostRequestCount ?? 0;
  const knownCostTotal = rows.reduce((sum, row) => sum + row.totalCostUsd, 0);
  const knownCostUsageCount = rows.reduce(
    (sum, row) => sum + row.knownCostUsageCount,
    0
  );

  return {
    totalCostUsd: knownCostUsageCount === 0 ? null : knownCostTotal,
    requestCount,
    unknownCostRequestCount,
    models: rows.map((row) => ({
      modelId: row.modelId,
      providerId: row.providerId,
      requestCount: row.requestCount,
      totalCostUsd: row.knownCostUsageCount === 0 ? null : row.totalCostUsd,
      unknownCostRequestCount: row.unknownCostRequestCount,
    })),
  };
}
