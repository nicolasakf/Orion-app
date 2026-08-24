
import { randomUUID } from "crypto";

import {
  EditCheckpointSchema,
  EditCheckpointStatusSchema,
  EditCheckpointTargetSchema,
  RecordEditCheckpointTargetRequestSchema,
  UpdateEditCheckpointStatusRequestSchema,
  stringifyCheckpointPayload,
  type EditCheckpoint,
  type EditCheckpointTarget,
  type EditCheckpointTargetKind,
  type RecordEditCheckpointTargetRequest,
  type UpdateEditCheckpointStatusRequest,
} from "@/lib/agent/edit-checkpoints";
import { UNCALIBRATED_CORRECTION_RATIO } from "@/lib/agent/token-budget";
import { GoalSessionSchema, type GoalSession } from "@/lib/agent/goals/types";
import {
  getChatStorageDegradedReason,
  isChatStorageDegraded,
  openChatDatabase,
  probeChatStorageAvailability,
  resetChatDatabaseLoader,
} from "@/lib/chat/chat-database-loader.server";
import {
  ChatWireSchema,
  CompactionSummaryWireSchema,
  type ChatWire,
} from "@/lib/chat/chat-types";
import type { OrionDatabase } from "@/lib/chat/sqlite-adapter";
import {
  clearFallbackChats,
  deleteFallbackChat,
  getFallbackChat,
  getFallbackChatCostSummary,
  getFallbackChatMetas,
  getFallbackChats,
  getFallbackEditCheckpointByRequestId,
  getFallbackEditCheckpointsForChat,
  getFallbackGoalSession,
  insertFallbackModelUsage,
  interruptFallbackOpenEditCheckpoints,
  recordFallbackEditCheckpointTarget,
  resolveFallbackOrCreateChatSession,
  resolveFallbackOrCreateModelRequest,
  saveFallbackChat,
  saveFallbackChats,
  saveFallbackGoalSession,
  updateFallbackChatSessionStatus,
  updateFallbackCompactionSummary,
  updateFallbackEditCheckpointStatus,
  deleteFallbackGoalSession,
} from "@/lib/chat/chat-storage-fallback.server";
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
  forked_from_json: string | null;
}

interface ChatMessageRow {
  message_json: string;
}

interface SubagentSessionRow {
  tool_call_id: string;
  session_json: string;
}

interface GoalSessionRow {
  session_json: string;
}

interface GoalEvaluationRow {
  evaluation_json: string;
}

interface EditCheckpointRow {
  id: string;
  request_id: string;
  local_chat_id: string | null;
  status: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

interface EditCheckpointTargetRow {
  id: string;
  checkpoint_id: string;
  kind: string;
  operation: string;
  path: string;
  target_id: string | null;
  before_json: string;
  after_json: string;
  before_hash: string | null;
  after_hash: string | null;
  first_tool_call_id: string | null;
  last_tool_call_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ChatSessionStatus = "idle" | "processing" | "completed" | "error";
export type ModelUsageCostStatus =
  | "exact"
  | "estimated"
  | "pending"
  | "unavailable"
  | "legacy_estimated"
  | "legacy_unavailable";

export interface ModelUsageInsert {
  requestId?: string | null;
  modelId: string;
  providerId: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  actualInputTokens?: number | null;
  actualOutputTokens?: number | null;
  actualCacheReadTokens?: number | null;
  actualCacheWriteTokens?: number | null;
  actualReasoningTokens?: number | null;
  costUsd?: number | null;
  estimatedInputTokens?: number | null;
  estimatedOutputTokens?: number | null;
  estimatedCacheReadTokens?: number | null;
  estimatedCacheWriteTokens?: number | null;
  estimatedReasoningTokens?: number | null;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  costStatus?: ModelUsageCostStatus;
  costSource?: string | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
  reasoningTokens?: number | null;
  isByok: boolean;
  gatewayGenerationId?: string | null;
  servedProviderId?: string | null;
  upstreamInferenceCostUsd?: number | null;
  gatewayIsByok?: boolean | null;
  credentialMode?: string | null;
  pricingSnapshot?: unknown;
  interactionMode?: string | null;
  estimatorVersion?: number | null;
}

export interface ChatCostSummaryModel {
  modelId: string;
  providerId: string;
  requestCount: number;
  totalCostUsd: number | null;
  unknownCostRequestCount: number;
  bestAvailableTotalUsd: number | null;
  exactTotalUsd: number;
  estimatedTotalUsd: number;
  legacyEstimatedTotalUsd: number;
  exactRequestCount: number;
  estimatedRequestCount: number;
  pendingRequestCount: number;
  unavailableRequestCount: number;
  legacyRequestCount: number;
}

export interface ChatCostSummary {
  version: 2;
  totalCostUsd: number | null;
  requestCount: number;
  unknownCostRequestCount: number;
  bestAvailableTotalUsd: number | null;
  exactTotalUsd: number;
  estimatedTotalUsd: number;
  legacyEstimatedTotalUsd: number;
  exactRequestCount: number;
  estimatedRequestCount: number;
  pendingRequestCount: number;
  unavailableRequestCount: number;
  legacyRequestCount: number;
  models: ChatCostSummaryModel[];
}

const CURRENT_SCHEMA_VERSION = 5;

let database: OrionDatabase | null = null;

export { getChatStorageDegradedReason, isChatStorageDegraded };

/** Returns whether chat APIs should use the in-memory fallback store. */
function usingFallbackStorage(): boolean {
  probeChatStorageAvailability();
  return isChatStorageDegraded();
}

/** Creates the durable chat tables that existed before SQLite schema versioning. */
function createBaseChatSchema(db: OrionDatabase): void {
  db.exec(`
      create table if not exists chats (
        id text primary key,
        title text not null,
        created_at text not null,
        updated_at text not null,
        compaction_summary_json text,
        forked_from_json text
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

/** Returns true when a table column exists in the current SQLite schema. */
function tableColumnExists(db: OrionDatabase, tableName: string, columnName: string): boolean {
  const rows = db
    .prepare("select name from pragma_table_info(?)")
    .all(tableName) as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

/** Adds local analogs of the hosted usage tables and marks the DB as v1. */
function migrateToVersion1(db: OrionDatabase): void {
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

/** Adds request-scoped edit checkpoint tables. */
function migrateToVersion2(db: OrionDatabase): void {
  const migrate = db.transaction(() => {
    createBaseChatSchema(db);
    db.exec(`
      create table if not exists edit_checkpoint (
        id text primary key,
        request_id text not null unique,
        local_chat_id text,
        status text not null default 'open'
          check (status in ('open', 'completed', 'interrupted', 'reverted')),
        summary text,
        created_at text not null,
        updated_at text not null,
        foreign key (request_id) references model_request(id) on delete cascade
      );

      create index if not exists edit_checkpoint_local_chat_id_idx
        on edit_checkpoint(local_chat_id) where local_chat_id is not null;
      create index if not exists edit_checkpoint_status_idx
        on edit_checkpoint(status);

      create table if not exists edit_checkpoint_target (
        id text primary key,
        checkpoint_id text not null,
        kind text not null check (kind in ('text_file', 'notebook_cell')),
        operation text not null check (operation in ('update', 'insert', 'delete')),
        path text not null,
        target_id text,
        before_json text not null,
        after_json text not null,
        before_hash text,
        after_hash text,
        first_tool_call_id text,
        last_tool_call_id text,
        created_at text not null,
        updated_at text not null,
        foreign key (checkpoint_id) references edit_checkpoint(id) on delete cascade
      );

      create unique index if not exists edit_checkpoint_target_unique_idx
        on edit_checkpoint_target(checkpoint_id, kind, path, coalesce(target_id, ''));
      create index if not exists edit_checkpoint_target_checkpoint_id_idx
        on edit_checkpoint_target(checkpoint_id);

      pragma user_version = 2;
    `);
  });

  migrate();
}

/** Adds persistent chat fork metadata. */
function migrateToVersion3(db: OrionDatabase): void {
  const migrate = db.transaction(() => {
    createBaseChatSchema(db);
    if (!tableColumnExists(db, "chats", "forked_from_json")) {
      db.exec("alter table chats add column forked_from_json text;");
    }
    db.exec("pragma user_version = 3;");
  });

  migrate();
}

const MODEL_USAGE_PROVENANCE_COLUMNS: Array<[string, string]> = [
  ["estimated_input_tokens", "integer"],
  ["estimated_output_tokens", "integer"],
  ["estimated_cache_read_tokens", "integer"],
  ["estimated_cache_write_tokens", "integer"],
  ["estimated_reasoning_tokens", "integer"],
  ["actual_input_tokens", "integer"],
  ["actual_output_tokens", "integer"],
  ["actual_cache_read_tokens", "integer"],
  ["actual_cache_write_tokens", "integer"],
  ["actual_reasoning_tokens", "integer"],
  ["estimated_cost_usd", "real"],
  ["actual_cost_usd", "real"],
  ["cost_status", "text"],
  ["cost_source", "text"],
  ["gateway_generation_id", "text"],
  ["served_provider_id", "text"],
  ["upstream_inference_cost_usd", "real"],
  ["gateway_is_byok", "integer"],
  ["credential_mode", "text"],
  ["pricing_snapshot_json", "text"],
  ["interaction_mode", "text"],
  ["estimator_version", "integer"],
  ["reconciled_at", "text"],
];

/** Ensures every provenance column exists on `model_usage` (repairs partial v4 databases). */
function ensureModelUsageProvenanceColumns(db: OrionDatabase): void {
  for (const [name, definition] of MODEL_USAGE_PROVENANCE_COLUMNS) {
    if (!tableColumnExists(db, "model_usage", name)) {
      db.exec(`alter table model_usage add column ${name} ${definition};`);
    }
  }
}

/** Adds provenance-aware usage accounting and persistent context calibration. */
function migrateToVersion4(db: OrionDatabase): void {
  const migrate = db.transaction(() => {
    ensureModelUsageProvenanceColumns(db);

    db.exec(`
      update model_usage
      set estimated_cost_usd = cost_usd,
          cost_status = case
            when cost_usd is null then 'legacy_unavailable'
            else 'legacy_estimated'
          end,
          cost_source = 'legacy'
      where cost_status is null;

      create unique index if not exists model_usage_gateway_generation_id_idx
        on model_usage(gateway_generation_id) where gateway_generation_id is not null;

      create table if not exists context_calibration (
        provider_id text not null,
        model_id text not null,
        interaction_mode text not null,
        estimator_version integer not null,
        sample_count integer not null,
        ewma_ratio real not null,
        rolling_ratios_json text not null,
        updated_at text not null,
        primary key (provider_id, model_id, interaction_mode, estimator_version)
      );

      pragma user_version = 4;
    `);
  });
  migrate();
}

/** Adds durable goal sessions and their review history. */
function migrateToVersion5(db: OrionDatabase): void {
  const migrate = db.transaction(() => {
    createBaseChatSchema(db);
    db.exec(`
      create table if not exists goal_session (
        id text primary key,
        chat_id text not null unique,
        session_json text not null,
        created_at text not null,
        updated_at text not null,
        foreign key (chat_id) references chats(id) on delete cascade
      );

      create table if not exists goal_evaluation (
        id text primary key,
        goal_id text not null,
        ordinal integer not null,
        evaluation_json text not null,
        created_at text not null,
        foreign key (goal_id) references goal_session(id) on delete cascade
      );

      create index if not exists goal_evaluation_goal_ordinal_idx
        on goal_evaluation(goal_id, ordinal);

      pragma user_version = 5;
    `);
  });
  migrate();
}

/** Runs all pending local SQLite migrations in order. */
function migrateDatabase(db: OrionDatabase): void {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Orion database schema version ${version}. Expected ${CURRENT_SCHEMA_VERSION} or lower.`
    );
  }

  if (version < 1) {
    migrateToVersion1(db);
  }
  if (version < 2) {
    migrateToVersion2(db);
  }
  if (version < 3) {
    migrateToVersion3(db);
  }
  if (version < 4) {
    migrateToVersion4(db);
  }
  if (version < 5) {
    migrateToVersion5(db);
  }

  const finalVersion = db.pragma("user_version", { simple: true }) as number;
  if (finalVersion >= 4) {
    ensureModelUsageProvenanceColumns(db);
  }
}

/** Opens Orion's local SQLite database and initializes the chat schema. */
export async function getChatDatabase(): Promise<OrionDatabase> {
  if (usingFallbackStorage()) {
    throw new Error(
      getChatStorageDegradedReason() ?? "SQLite chat storage is unavailable on this machine."
    );
  }

  if (database) return database;

  await ensureOrionDataDirectory();
  const opened = openChatDatabase(getOrionDatabasePath());
  if (!opened) {
    throw new Error(
      getChatStorageDegradedReason() ?? "SQLite chat storage is unavailable on this machine."
    );
  }

  database = opened;
  database.pragma("busy_timeout = 5000");
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  migrateDatabase(database);

  return database;
}

/** Closes the cached SQLite connection, primarily for tests. */
export function closeChatDatabase(): void {
  database?.close();
  database = null;
  resetChatDatabaseLoader();
}

/** Saves one complete chat, replacing message and subagent rows atomically. */
export async function saveChat(chat: ChatWire): Promise<void> {
  if (usingFallbackStorage()) {
    await saveFallbackChat(chat);
    return;
  }

  const parsed = ChatWireSchema.parse(chat);
  const db = await getChatDatabase();
  const transaction = db.transaction((nextChat: ChatWire) => {
    db.prepare(
      `
        insert into chats (id, title, created_at, updated_at, compaction_summary_json, forked_from_json)
        values (@id, @title, @createdAt, @updatedAt, @compactionSummaryJson, @forkedFromJson)
        on conflict(id) do update set
          title = excluded.title,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          compaction_summary_json = excluded.compaction_summary_json,
          forked_from_json = excluded.forked_from_json
      `
    ).run({
      id: nextChat.id,
      title: nextChat.title,
      createdAt: nextChat.createdAt,
      updatedAt: nextChat.updatedAt,
      compactionSummaryJson: nextChat.compactionSummary
        ? JSON.stringify(nextChat.compactionSummary)
        : null,
      forkedFromJson: nextChat.forkedFrom
        ? JSON.stringify(nextChat.forkedFrom)
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
  if (usingFallbackStorage()) {
    await saveFallbackChats(chats);
    return;
  }

  for (const chat of chats) {
    await saveChat(chat);
  }
}

/** Returns all chats, newest first. */
export async function getChats(): Promise<ChatWire[]> {
  if (usingFallbackStorage()) {
    return getFallbackChats();
  }

  const metas = await getChatMetas();
  const chats = await Promise.all(
    metas.map((meta) => getChat(meta.id))
  );
  return chats.filter((chat): chat is ChatWire => chat !== undefined);
}

/** Returns chat metadata with empty message arrays, newest first. */
export async function getChatMetas(): Promise<ChatWire[]> {
  if (usingFallbackStorage()) {
    return getFallbackChatMetas();
  }

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
      forkedFrom: row.forked_from_json ? JSON.parse(row.forked_from_json) : undefined,
    })
  );
}

/** Returns one complete chat by id. */
export async function getChat(chatId: string): Promise<ChatWire | undefined> {
  if (usingFallbackStorage()) {
    return getFallbackChat(chatId);
  }

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
    forkedFrom: row.forked_from_json ? JSON.parse(row.forked_from_json) : undefined,
  });
}

/** Deletes one chat and its dependent message/session rows. */
export async function deleteChat(chatId: string): Promise<void> {
  if (usingFallbackStorage()) {
    await deleteFallbackChat(chatId);
    return;
  }

  const db = await getChatDatabase();
  db.prepare("delete from chats where id = ?").run(chatId);
}

/** Deletes all local chat history from SQLite. */
export async function clearChats(): Promise<void> {
  if (usingFallbackStorage()) {
    await clearFallbackChats();
    return;
  }

  const db = await getChatDatabase();
  db.prepare("delete from chats").run();
}

/** Saves one complete goal session and replaces its evaluation rows atomically. */
export async function saveGoalSession(session: GoalSession): Promise<void> {
  if (usingFallbackStorage()) {
    await saveFallbackGoalSession(session);
    return;
  }

  const parsed = GoalSessionSchema.parse(session);
  const db = await getChatDatabase();
  const transaction = db.transaction((nextSession: GoalSession) => {
    const existing = db.prepare("select id from goal_session where chat_id = ?")
      .get(nextSession.chatId) as { id: string } | undefined;
    if (existing && existing.id !== nextSession.id) {
      db.prepare("delete from goal_session where id = ?").run(existing.id);
    }
    const sessionWithoutEvaluations = { ...nextSession, evaluations: [] };
    db.prepare(`
      insert into goal_session (id, chat_id, session_json, created_at, updated_at)
      values (@id, @chatId, @sessionJson, @createdAt, @updatedAt)
      on conflict(chat_id) do update set
        id = excluded.id,
        session_json = excluded.session_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run({
      id: nextSession.id,
      chatId: nextSession.chatId,
      sessionJson: JSON.stringify(sessionWithoutEvaluations),
      createdAt: nextSession.createdAt,
      updatedAt: nextSession.updatedAt,
    });
    db.prepare("delete from goal_evaluation where goal_id = ?").run(nextSession.id);
    const insertEvaluation = db.prepare(`
      insert into goal_evaluation (id, goal_id, ordinal, evaluation_json, created_at)
      values (@id, @goalId, @ordinal, @evaluationJson, @createdAt)
    `);
    nextSession.evaluations.forEach((evaluation, ordinal) => {
      insertEvaluation.run({
        id: evaluation.id,
        goalId: nextSession.id,
        ordinal,
        evaluationJson: JSON.stringify(evaluation),
        createdAt: evaluation.createdAt,
      });
    });
  });
  transaction(parsed);
}

/** Returns the current goal session associated with one chat. */
export async function getGoalSession(chatId: string): Promise<GoalSession | null> {
  if (usingFallbackStorage()) return getFallbackGoalSession(chatId);
  const db = await getChatDatabase();
  const row = db.prepare("select session_json from goal_session where chat_id = ?")
    .get(chatId) as GoalSessionRow | undefined;
  if (!row) return null;
  const rawSession = JSON.parse(row.session_json) as Record<string, unknown>;
  const goalId = typeof rawSession.id === "string" ? rawSession.id : "";
  const evaluationRows = db.prepare(
    "select evaluation_json from goal_evaluation where goal_id = ? order by ordinal asc"
  ).all(goalId) as GoalEvaluationRow[];
  return GoalSessionSchema.parse({
    ...rawSession,
    evaluations: evaluationRows.map((evaluation) => JSON.parse(evaluation.evaluation_json)),
  });
}

/** Deletes the current goal session associated with one chat. */
export async function deleteGoalSession(chatId: string): Promise<void> {
  if (usingFallbackStorage()) {
    await deleteFallbackGoalSession(chatId);
    return;
  }
  const db = await getChatDatabase();
  db.prepare("delete from goal_session where chat_id = ?").run(chatId);
}

/** Updates or clears a chat compaction summary without rewriting messages. */
export async function updateCompactionSummary(
  chatId: string,
  summary: ChatWire["compactionSummary"] | null
): Promise<void> {
  if (usingFallbackStorage()) {
    await updateFallbackCompactionSummary(chatId, summary);
    return;
  }

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

/** Converts a checkpoint target row from SQLite into the public wire shape. */
function mapEditCheckpointTargetRow(row: EditCheckpointTargetRow): EditCheckpointTarget {
  return EditCheckpointTargetSchema.parse({
    id: row.id,
    checkpointId: row.checkpoint_id,
    kind: row.kind,
    operation: row.operation,
    path: row.path,
    targetId: row.target_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    beforeHash: row.before_hash,
    afterHash: row.after_hash,
    firstToolCallId: row.first_tool_call_id,
    lastToolCallId: row.last_tool_call_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** Converts a checkpoint row and its targets from SQLite into the public wire shape. */
function mapEditCheckpointRow(
  row: EditCheckpointRow,
  targets: EditCheckpointTarget[] = []
): EditCheckpoint {
  return EditCheckpointSchema.parse({
    id: row.id,
    requestId: row.request_id,
    localChatId: row.local_chat_id,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targets,
  });
}

/** Ensures a model_request exists for direct/local checkpoint writes. */
function ensureModelRequestRow(db: OrionDatabase, requestId: string): void {
  db.prepare(
    `
      insert into model_request (id, chat_session_id, origin, created_at)
      values (?, null, 'user', ?)
      on conflict(id) do nothing
    `
  ).run(requestId, new Date().toISOString());
}

/** Ensures the request-scoped checkpoint row exists and returns its id. */
function ensureEditCheckpoint(
  db: OrionDatabase,
  requestId: string,
  localChatId?: string
): string {
  ensureModelRequestRow(db, requestId);
  const now = new Date().toISOString();
  const checkpointId = randomUUID();

  db.prepare(
    `
      insert into edit_checkpoint
        (id, request_id, local_chat_id, status, summary, created_at, updated_at)
      values (@id, @requestId, @localChatId, 'open', null, @createdAt, @updatedAt)
      on conflict(request_id) do update set
        local_chat_id = coalesce(edit_checkpoint.local_chat_id, excluded.local_chat_id),
        updated_at = excluded.updated_at
    `
  ).run({
    id: checkpointId,
    requestId,
    localChatId: localChatId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const row = db
    .prepare("select id from edit_checkpoint where request_id = ?")
    .get(requestId) as { id: string } | undefined;
  if (!row) {
    throw new Error(`Failed to create edit checkpoint for request '${requestId}'.`);
  }
  return row.id;
}

/** Finds an existing target row for a coalescing key. */
function getExistingCheckpointTarget(
  db: OrionDatabase,
  checkpointId: string,
  kind: EditCheckpointTargetKind,
  targetPath: string,
  targetId: string | null
): EditCheckpointTargetRow | undefined {
  return db
    .prepare(
      `
        select * from edit_checkpoint_target
        where checkpoint_id = ?
          and kind = ?
          and path = ?
          and coalesce(target_id, '') = coalesce(?, '')
      `
    )
    .get(checkpointId, kind, targetPath, targetId) as
    | EditCheckpointTargetRow
    | undefined;
}

/** Records one successful edit target, coalescing repeated edits in the same request. */
export async function recordEditCheckpointTarget(
  input: RecordEditCheckpointTargetRequest
): Promise<EditCheckpoint | null> {
  if (usingFallbackStorage()) {
    return recordFallbackEditCheckpointTarget(input);
  }

  const parsed = RecordEditCheckpointTargetRequestSchema.parse(input);
  const db = await getChatDatabase();
  const transaction = db.transaction(
    (target: RecordEditCheckpointTargetRequest): EditCheckpoint | null => {
      const checkpointId = ensureEditCheckpoint(
        db,
        target.requestId,
        target.localChatId
      );
      const targetId = target.targetId ?? null;
      const beforeJson = stringifyCheckpointPayload(target.before);
      const afterJson = stringifyCheckpointPayload(target.after);
      const beforeHash = target.beforeHash ?? null;
      const afterHash = target.afterHash ?? null;
      const existing = getExistingCheckpointTarget(
        db,
        checkpointId,
        target.kind,
        target.path,
        targetId
      );

      if (!existing && beforeJson === afterJson) {
        return getEditCheckpointByRequestIdSync(db, target.requestId);
      }

      const now = new Date().toISOString();
      const toolCallId = target.toolCallId ?? null;

      if (!existing) {
        db.prepare(
          `
            insert into edit_checkpoint_target (
              id, checkpoint_id, kind, operation, path, target_id,
              before_json, after_json, before_hash, after_hash,
              first_tool_call_id, last_tool_call_id, created_at, updated_at
            ) values (
              @id, @checkpointId, @kind, @operation, @path, @targetId,
              @beforeJson, @afterJson, @beforeHash, @afterHash,
              @firstToolCallId, @lastToolCallId, @createdAt, @updatedAt
            )
          `
        ).run({
          id: randomUUID(),
          checkpointId,
          kind: target.kind,
          operation: target.operation,
          path: target.path,
          targetId,
          beforeJson,
          afterJson,
          beforeHash,
          afterHash,
          firstToolCallId: toolCallId,
          lastToolCallId: toolCallId,
          createdAt: now,
          updatedAt: now,
        });
        return getEditCheckpointByRequestIdSync(db, target.requestId);
      }

      const coalesced = coalesceEditCheckpointTarget(existing, {
        operation: target.operation,
        beforeJson,
        afterJson,
        beforeHash,
        afterHash,
      });

      if (coalesced === null) {
        db.prepare("delete from edit_checkpoint_target where id = ?").run(existing.id);
        return getEditCheckpointByRequestIdSync(db, target.requestId);
      }

      if (coalesced.beforeJson === coalesced.afterJson) {
        db.prepare("delete from edit_checkpoint_target where id = ?").run(existing.id);
        return getEditCheckpointByRequestIdSync(db, target.requestId);
      }

      db.prepare(
        `
          update edit_checkpoint_target
          set operation = @operation,
            before_json = @beforeJson,
            after_json = @afterJson,
            before_hash = @beforeHash,
            after_hash = @afterHash,
            last_tool_call_id = @lastToolCallId,
            updated_at = @updatedAt
          where id = @id
        `
      ).run({
        id: existing.id,
        operation: coalesced.operation,
        beforeJson: coalesced.beforeJson,
        afterJson: coalesced.afterJson,
        beforeHash: coalesced.beforeHash,
        afterHash: coalesced.afterHash,
        lastToolCallId: toolCallId ?? existing.last_tool_call_id,
        updatedAt: now,
      });

      db.prepare(
        "update edit_checkpoint set updated_at = ? where id = ?"
      ).run(now, checkpointId);

      return getEditCheckpointByRequestIdSync(db, target.requestId);
    }
  );

  return transaction(parsed);
}

interface CoalescingInput {
  operation: "update" | "insert" | "delete";
  beforeJson: string;
  afterJson: string;
  beforeHash: string | null;
  afterHash: string | null;
}

/** Applies checkpoint target coalescing rules for repeated edits in one request. */
function coalesceEditCheckpointTarget(
  existing: EditCheckpointTargetRow,
  next: CoalescingInput
): CoalescingInput | null {
  if (existing.operation === "insert") {
    if (next.operation === "delete") return null;
    return {
      operation: "insert",
      beforeJson: existing.before_json,
      afterJson: next.afterJson,
      beforeHash: existing.before_hash,
      afterHash: next.afterHash,
    };
  }

  if (existing.operation === "delete") {
    if (next.operation === "delete") {
      return {
        operation: "delete",
        beforeJson: existing.before_json,
        afterJson: next.afterJson,
        beforeHash: existing.before_hash,
        afterHash: next.afterHash,
      };
    }
    if (existing.before_json === next.afterJson) return null;
    return {
      operation: "update",
      beforeJson: existing.before_json,
      afterJson: next.afterJson,
      beforeHash: existing.before_hash,
      afterHash: next.afterHash,
    };
  }

  if (next.operation === "delete") {
    return {
      operation: "delete",
      beforeJson: existing.before_json,
      afterJson: next.afterJson,
      beforeHash: existing.before_hash,
      afterHash: next.afterHash,
    };
  }

  return {
    operation: "update",
    beforeJson: existing.before_json,
    afterJson: next.afterJson,
    beforeHash: existing.before_hash,
    afterHash: next.afterHash,
  };
}

/** Synchronous checkpoint lookup used inside SQLite transactions. */
function getEditCheckpointByRequestIdSync(
  db: OrionDatabase,
  requestId: string
): EditCheckpoint | null {
  const row = db
    .prepare("select * from edit_checkpoint where request_id = ?")
    .get(requestId) as EditCheckpointRow | undefined;
  if (!row) return null;
  const targets = db
    .prepare(
      "select * from edit_checkpoint_target where checkpoint_id = ? order by created_at asc"
    )
    .all(row.id) as EditCheckpointTargetRow[];
  return mapEditCheckpointRow(row, targets.map(mapEditCheckpointTargetRow));
}

/** Returns one edit checkpoint by model request id. */
export async function getEditCheckpointByRequestId(
  requestId: string
): Promise<EditCheckpoint | null> {
  if (usingFallbackStorage()) {
    return getFallbackEditCheckpointByRequestId(requestId);
  }

  const db = await getChatDatabase();
  return getEditCheckpointByRequestIdSync(db, requestId);
}

/** Lists edit checkpoints for a chat, newest first. */
export async function getEditCheckpointsForChat(
  localChatId: string
): Promise<EditCheckpoint[]> {
  if (usingFallbackStorage()) {
    return getFallbackEditCheckpointsForChat(localChatId);
  }

  const db = await getChatDatabase();
  const rows = db
    .prepare(
      `
        select * from edit_checkpoint
        where local_chat_id = ?
        order by updated_at desc
      `
    )
    .all(localChatId) as EditCheckpointRow[];

  return rows.map((row) => {
    const targets = db
      .prepare(
        "select * from edit_checkpoint_target where checkpoint_id = ? order by created_at asc"
      )
      .all(row.id) as EditCheckpointTargetRow[];
    return mapEditCheckpointRow(row, targets.map(mapEditCheckpointTargetRow));
  });
}

/** Updates one edit checkpoint status. */
export async function updateEditCheckpointStatus(
  requestId: string,
  input: UpdateEditCheckpointStatusRequest
): Promise<EditCheckpoint | null> {
  if (usingFallbackStorage()) {
    return updateFallbackEditCheckpointStatus(requestId, input);
  }

  const parsed = UpdateEditCheckpointStatusRequestSchema.parse(input);
  const db = await getChatDatabase();
  const status = EditCheckpointStatusSchema.parse(parsed.status);
  db.prepare(
    `
      update edit_checkpoint
      set status = ?, summary = coalesce(?, summary), updated_at = ?
      where request_id = ?
    `
  ).run(status, parsed.summary ?? null, new Date().toISOString(), requestId);
  return getEditCheckpointByRequestIdSync(db, requestId);
}

/** Marks stale open checkpoints as interrupted after abandoned/crashed runs. */
export async function interruptOpenEditCheckpoints(options: {
  olderThanMs?: number;
  localChatId?: string;
} = {}): Promise<number> {
  if (usingFallbackStorage()) {
    return interruptFallbackOpenEditCheckpoints({
      olderThanMs: options.olderThanMs ?? 0,
    });
  }

  const db = await getChatDatabase();
  const olderThanMs = options.olderThanMs ?? 0;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const result = options.localChatId
    ? db
      .prepare(
        `
            update edit_checkpoint
            set status = 'interrupted', updated_at = ?
            where status = 'open' and updated_at <= ? and local_chat_id = ?
          `
      )
      .run(new Date().toISOString(), cutoff, options.localChatId)
    : db
      .prepare(
        `
            update edit_checkpoint
            set status = 'interrupted', updated_at = ?
            where status = 'open' and updated_at <= ?
          `
      )
      .run(new Date().toISOString(), cutoff);
  return result.changes;
}

/** Resolves or creates a local chat session row for usage tracking. */
export async function resolveOrCreateChatSession(
  localChatId: string | undefined,
  status: ChatSessionStatus = "processing"
): Promise<{ sessionId: string } | null> {
  if (usingFallbackStorage()) {
    return resolveFallbackOrCreateChatSession(localChatId, status);
  }

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
  if (usingFallbackStorage()) {
    await updateFallbackChatSessionStatus(sessionId, status);
    return;
  }

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
  if (usingFallbackStorage()) {
    return resolveFallbackOrCreateModelRequest(options);
  }

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
  if (usingFallbackStorage()) {
    await insertFallbackModelUsage(usage);
    return;
  }

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
        estimated_input_tokens,
        estimated_output_tokens,
        estimated_cache_read_tokens,
        estimated_cache_write_tokens,
        estimated_reasoning_tokens,
        actual_input_tokens,
        actual_output_tokens,
        actual_cache_read_tokens,
        actual_cache_write_tokens,
        actual_reasoning_tokens,
        estimated_cost_usd,
        actual_cost_usd,
        cost_status,
        cost_source,
        gateway_generation_id,
        served_provider_id,
        upstream_inference_cost_usd,
        gateway_is_byok,
        credential_mode,
        pricing_snapshot_json,
        interaction_mode,
        estimator_version,
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
        @estimatedInputTokens,
        @estimatedOutputTokens,
        @estimatedCacheReadTokens,
        @estimatedCacheWriteTokens,
        @estimatedReasoningTokens,
        @actualInputTokens,
        @actualOutputTokens,
        @actualCacheReadTokens,
        @actualCacheWriteTokens,
        @actualReasoningTokens,
        @estimatedCostUsd,
        @actualCostUsd,
        @costStatus,
        @costSource,
        @gatewayGenerationId,
        @servedProviderId,
        @upstreamInferenceCostUsd,
        @gatewayIsByok,
        @credentialMode,
        @pricingSnapshotJson,
        @interactionMode,
        @estimatorVersion,
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
    estimatedInputTokens: usage.estimatedInputTokens ?? null,
    estimatedOutputTokens: usage.estimatedOutputTokens ?? null,
    estimatedCacheReadTokens: usage.estimatedCacheReadTokens ?? null,
    estimatedCacheWriteTokens: usage.estimatedCacheWriteTokens ?? null,
    estimatedReasoningTokens: usage.estimatedReasoningTokens ?? null,
    actualInputTokens: usage.actualInputTokens ?? usage.tokensIn ?? null,
    actualOutputTokens: usage.actualOutputTokens ?? usage.tokensOut ?? null,
    actualCacheReadTokens: usage.actualCacheReadTokens ?? usage.cacheReadTokens ?? null,
    actualCacheWriteTokens: usage.actualCacheWriteTokens ?? usage.cacheCreationTokens ?? null,
    actualReasoningTokens: usage.actualReasoningTokens ?? usage.reasoningTokens ?? null,
    estimatedCostUsd: usage.estimatedCostUsd ?? usage.costUsd ?? null,
    actualCostUsd: usage.actualCostUsd ?? null,
    costStatus:
      usage.costStatus ??
      ((usage.estimatedCostUsd ?? usage.costUsd) == null ? "unavailable" : "estimated"),
    costSource: usage.costSource ?? null,
    gatewayGenerationId: usage.gatewayGenerationId ?? null,
    servedProviderId: usage.servedProviderId ?? null,
    upstreamInferenceCostUsd: usage.upstreamInferenceCostUsd ?? null,
    gatewayIsByok:
      usage.gatewayIsByok == null ? null : usage.gatewayIsByok ? 1 : 0,
    credentialMode: usage.credentialMode ?? null,
    pricingSnapshotJson:
      usage.pricingSnapshot === undefined ? null : JSON.stringify(usage.pricingSnapshot),
    interactionMode: usage.interactionMode ?? null,
    estimatorVersion: usage.estimatorVersion ?? null,
    createdAt: new Date().toISOString(),
  });
}

export interface ContextCalibrationKey {
  providerId: string;
  modelId: string;
  interactionMode: string;
  estimatorVersion: number;
}

export interface ContextCalibrationSnapshot {
  sampleCount: number;
  correctionRatio: number;
}

/**
 * Reads the conservative correction factor for one provider/model/mode tuple.
 *
 * Conservative means `max(ewma, p90)` — a spiky model should be budgeted against
 * its worse turns. It deliberately does *not* floor the result at 1: a model the
 * estimator systematically overshoots must be correctable downward, or the pill
 * reports a number the provider never charges. The caller clamps to a sane band.
 */
export async function getContextCalibration(
  key: ContextCalibrationKey
): Promise<ContextCalibrationSnapshot> {
  if (usingFallbackStorage()) {
    return { sampleCount: 0, correctionRatio: UNCALIBRATED_CORRECTION_RATIO };
  }
  const db = await getChatDatabase();
  const row = db.prepare(
    `select sample_count as sampleCount, ewma_ratio as ewmaRatio,
            rolling_ratios_json as rollingRatiosJson
       from context_calibration
      where provider_id = ? and model_id = ? and interaction_mode = ?
        and estimator_version = ?`
  ).get(key.providerId, key.modelId, key.interactionMode, key.estimatorVersion) as
    | { sampleCount: number; ewmaRatio: number; rollingRatiosJson: string }
    | undefined;
  if (!row) return { sampleCount: 0, correctionRatio: UNCALIBRATED_CORRECTION_RATIO };
  let ratios: number[] = [];
  try {
    const parsed = JSON.parse(row.rollingRatiosJson) as unknown;
    if (Array.isArray(parsed)) {
      ratios = parsed.filter((value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0
      );
    }
  } catch {
    ratios = [];
  }
  const sorted = [...ratios].sort((left, right) => left - right);
  // With no usable rolling samples the EWMA is the only signal; a literal 1 here
  // would silently re-introduce the floor this function no longer applies.
  const p90 = sorted.length === 0
    ? row.ewmaRatio
    : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];
  return {
    sampleCount: row.sampleCount,
    correctionRatio: Math.max(row.ewmaRatio, p90),
  };
}

/** Updates calibration from one provider-reported input-token observation. */
export async function updateContextCalibration(
  key: ContextCalibrationKey,
  observation: { rawEstimatedTokens: number; actualInputTokens: number }
): Promise<void> {
  if (
    usingFallbackStorage() ||
    observation.rawEstimatedTokens <= 0 ||
    observation.actualInputTokens <= 0
  ) return;
  const db = await getChatDatabase();
  const existing = db.prepare(
    `select sample_count as sampleCount, ewma_ratio as ewmaRatio,
            rolling_ratios_json as rollingRatiosJson
       from context_calibration
      where provider_id = ? and model_id = ? and interaction_mode = ?
        and estimator_version = ?`
  ).get(key.providerId, key.modelId, key.interactionMode, key.estimatorVersion) as
    | { sampleCount: number; ewmaRatio: number; rollingRatiosJson: string }
    | undefined;
  let ratios: number[] = [];
  if (existing) {
    try {
      const parsed = JSON.parse(existing.rollingRatiosJson) as unknown;
      if (Array.isArray(parsed)) {
        ratios = parsed.filter((value): value is number =>
          typeof value === "number" && Number.isFinite(value) && value > 0
        );
      }
    } catch {
      ratios = [];
    }
  }
  const ratio = observation.actualInputTokens / observation.rawEstimatedTokens;
  ratios = [...ratios, ratio].slice(-20);
  const ewmaRatio = existing
    ? 0.25 * ratio + 0.75 * existing.ewmaRatio
    : ratio;
  db.prepare(
    `insert into context_calibration (
       provider_id, model_id, interaction_mode, estimator_version,
       sample_count, ewma_ratio, rolling_ratios_json, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(provider_id, model_id, interaction_mode, estimator_version)
     do update set sample_count = excluded.sample_count,
                   ewma_ratio = excluded.ewma_ratio,
                   rolling_ratios_json = excluded.rolling_ratios_json,
                   updated_at = excluded.updated_at`
  ).run(
    key.providerId,
    key.modelId,
    key.interactionMode,
    key.estimatorVersion,
    (existing?.sampleCount ?? 0) + 1,
    ewmaRatio,
    JSON.stringify(ratios),
    new Date().toISOString()
  );
}

export interface PendingVercelGeneration {
  generationId: string;
  modelId: string;
}

/** Returns durable pending Gateway generations for a chat. */
export async function getPendingVercelGenerationsForChat(
  localChatId: string
): Promise<PendingVercelGeneration[]> {
  if (usingFallbackStorage()) return [];
  const db = await getChatDatabase();
  return db.prepare(
    `select usage.gateway_generation_id as generationId, usage.model_id as modelId
       from model_usage usage
       join model_request request on request.id = usage.request_id
       join chat_session session on session.id = request.chat_session_id
      where session.local_chat_id = ? and usage.provider_id = 'vercel'
        and usage.cost_status = 'pending'
        and usage.gateway_generation_id is not null
      order by usage.created_at asc
      limit 20`
  ).all(localChatId) as PendingVercelGeneration[];
}

/** Replaces a pending Gateway row with Vercel's authoritative generation data. */
export async function reconcileVercelModelUsage(input: {
  generationId: string;
  totalCostUsd: number;
  upstreamInferenceCostUsd: number;
  servedProviderId: string;
  isByok: boolean;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
}): Promise<boolean> {
  if (usingFallbackStorage()) return false;
  const db = await getChatDatabase();
  const result = db.prepare(
    `update model_usage
        set actual_cost_usd = @totalCostUsd,
            cost_usd = @totalCostUsd,
            cost_status = 'exact',
            cost_source = 'vercel_generation',
            served_provider_id = @servedProviderId,
            upstream_inference_cost_usd = @upstreamInferenceCostUsd,
            gateway_is_byok = @isByok,
            tokens_in = @promptTokens,
            tokens_out = @completionTokens,
            reasoning_tokens = @reasoningTokens,
            cache_read_tokens = @cachedTokens,
            cache_creation_tokens = @cacheCreationTokens,
            actual_input_tokens = @promptTokens,
            actual_output_tokens = @completionTokens,
            actual_reasoning_tokens = @reasoningTokens,
            actual_cache_read_tokens = @cachedTokens,
            actual_cache_write_tokens = @cacheCreationTokens,
            reconciled_at = @reconciledAt
      where gateway_generation_id = @generationId`
  ).run({
    ...input,
    isByok: input.isByok ? 1 : 0,
    reconciledAt: new Date().toISOString(),
  });
  return result.changes > 0;
}

/** Aggregates cost by usage rows, but counts distinct logical model requests. */
export async function getChatCostSummary(
  localChatId: string
): Promise<ChatCostSummary> {
  if (usingFallbackStorage()) {
    return getFallbackChatCostSummary(localChatId);
  }

  const db = await getChatDatabase();
  type UsageCostRow = {
    requestId: string;
    usageId: string | null;
    modelId: string | null;
    providerId: string | null;
    estimatedCostUsd: number | null;
    actualCostUsd: number | null;
    costStatus: ModelUsageCostStatus | null;
  };
  const rows = db.prepare(
    `select request.id as requestId, usage.id as usageId,
            usage.model_id as modelId, usage.provider_id as providerId,
            usage.estimated_cost_usd as estimatedCostUsd,
            usage.actual_cost_usd as actualCostUsd,
            usage.cost_status as costStatus
       from model_request request
       join chat_session session on session.id = request.chat_session_id
       left join model_usage usage on usage.request_id = request.id
      where session.local_chat_id = ? and request.origin != 'title_generation'`
  ).all(localChatId) as UsageCostRow[];

  /** Summarizes usage rows while counting distinct logical requests. */
  const summarize = (input: UsageCostRow[]) => {
    const requestIds = new Set(input.map((row) => row.requestId));
    const exact = new Set<string>();
    const estimated = new Set<string>();
    const pending = new Set<string>();
    const unavailable = new Set<string>();
    const legacy = new Set<string>();
    let bestAvailableTotalUsd = 0;
    let exactTotalUsd = 0;
    let estimatedTotalUsd = 0;
    let legacyEstimatedTotalUsd = 0;
    let hasBestAvailableCost = false;

    for (const row of input) {
      if (!row.usageId) {
        unavailable.add(row.requestId);
        continue;
      }
      const status = row.costStatus ?? "legacy_unavailable";
      const best = row.actualCostUsd ?? row.estimatedCostUsd;
      if (best != null) {
        bestAvailableTotalUsd += best;
        hasBestAvailableCost = true;
      }
      if (status === "exact") {
        exact.add(row.requestId);
        exactTotalUsd += row.actualCostUsd ?? 0;
      } else if (status === "estimated") {
        estimated.add(row.requestId);
        estimatedTotalUsd += row.estimatedCostUsd ?? 0;
      } else if (status === "pending") {
        pending.add(row.requestId);
        estimatedTotalUsd += row.estimatedCostUsd ?? 0;
      } else if (status === "legacy_estimated") {
        legacy.add(row.requestId);
        legacyEstimatedTotalUsd += row.estimatedCostUsd ?? 0;
      } else {
        unavailable.add(row.requestId);
        if (status === "legacy_unavailable") legacy.add(row.requestId);
      }
    }

    const unknownCostRequestCount = new Set([...pending, ...unavailable]).size;
    return {
      totalCostUsd: hasBestAvailableCost ? bestAvailableTotalUsd : null,
      requestCount: requestIds.size,
      unknownCostRequestCount,
      bestAvailableTotalUsd: hasBestAvailableCost ? bestAvailableTotalUsd : null,
      exactTotalUsd,
      estimatedTotalUsd,
      legacyEstimatedTotalUsd,
      exactRequestCount: exact.size,
      estimatedRequestCount: estimated.size,
      pendingRequestCount: pending.size,
      unavailableRequestCount: unavailable.size,
      legacyRequestCount: legacy.size,
    };
  };

  const modelRows = new Map<string, UsageCostRow[]>();
  for (const row of rows) {
    if (!row.modelId || !row.providerId) continue;
    const key = `${row.providerId}\u0000${row.modelId}`;
    modelRows.set(key, [...(modelRows.get(key) ?? []), row]);
  }
  const models = Array.from(modelRows.entries()).map(([key, modelUsage]) => {
    const [providerId, modelId] = key.split("\u0000");
    return { modelId, providerId, ...summarize(modelUsage) };
  }).sort((left, right) =>
    (right.bestAvailableTotalUsd ?? -1) - (left.bestAvailableTotalUsd ?? -1) ||
    right.requestCount - left.requestCount ||
    left.modelId.localeCompare(right.modelId)
  );

  return { version: 2, ...summarize(rows), models };
}
