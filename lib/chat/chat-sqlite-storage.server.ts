import "server-only";

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

let database: Database.Database | null = null;

/** Opens Orion's local SQLite database and initializes the chat schema. */
export async function getChatDatabase(): Promise<Database.Database> {
  if (database) return database;

  await ensureOrionDataDirectory();
  database = new Database(getOrionDatabasePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
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
