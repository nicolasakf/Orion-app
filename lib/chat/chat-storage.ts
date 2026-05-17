/**
 * Chat Storage Utility using IndexedDB
 * Handles persistent storage of chat history and messages
 */

import type { UIMessage } from "ai";
import type { ChatMessageMetadata } from "@/lib/chat/chat-references";

export type SubagentSessionStatus = "running" | "completed" | "error" | "cancelled";

export interface SubagentSession {
  subagentType: string;
  label: string;
  description: string;
  status: SubagentSessionStatus;
  messages: UIMessage[];
  /** Writable tmp notebook path for the run, used by Show report and reconnect. */
  tmpNotebookPath?: string;
  /** 1-based run index used for the sub-agent dev-log filename. */
  subagentDevLogInstance?: number;
  /** Tool call id of the prior run this session reconnected to, if any. */
  reconnectedFromToolCallId?: string;
  summary?: string;
  errorText?: string;
  stepsUsed?: number;
  stoppedByLimit?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Metadata produced by a compaction run. Stored per-chat; only one at a time. */
export interface CompactionSummary {
  /** LLM-generated summary of all turns up to and including `coversThrough`. */
  text: string;
  /** ID of the last UIMessage included in this summary (inclusive boundary). */
  coversThrough: string;
  createdAt: Date;
  /** Model used to generate the summary. */
  model: string;
  /** Approximate tokens saved vs. replaying the full history (informational). */
  tokensSaved: number;
}

interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  subagentSessions?: Record<string, SubagentSession>;
  createdAt: Date;
  updatedAt: Date;
  /** Set when the conversation has been compacted. Wire payloads replay from summary. */
  compactionSummary?: CompactionSummary;
}

/** ChatMessage extends UIMessage with additional Orion-specific fields. */
interface ChatMessage extends UIMessage<ChatMessageMetadata> {
  timestamp: Date;
  modelUsed?: string;
  checkpointId?: string;
  createdAt?: Date;
}

/** Extract text content from a UIMessage's parts. */
function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

const DB_NAME = "OrionChatStorage";
/** Monotonic: never lower this — browsers reject `open` with a version below the on-disk DB (VersionError). */
const DB_VERSION = 4;
const STORE_NAME = "chats";
const CHAT_META_STORE = "chatMetas";
const CHAT_MESSAGE_STORE = "chatMessages";

type PersistedChatMeta = Omit<Chat, "messages" | "subagentSessions" | "createdAt" | "updatedAt" | "compactionSummary"> & {
  createdAt: string;
  updatedAt: string;
  compactionSummary?: Omit<CompactionSummary, "createdAt"> & { createdAt: string };
};

type PersistedSubagentSession = Omit<SubagentSession, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

interface PersistedChatMessages {
  id: string;
  messages: Array<Omit<ChatMessage, "timestamp" | "createdAt"> & {
    timestamp: string;
    createdAt?: string;
  }>;
  subagentSessions?: Record<string, PersistedSubagentSession>;
}

/**
 * Older persisted messages used `content: string` (pre–UI message `parts`). Normalize for `UIMessage` consumers.
 */
function normalizeStoredMessage(message: Record<string, unknown>): ChatMessage {
  const { content, ...base } = message;
  const timestamp =
    base.timestamp instanceof Date
      ? base.timestamp
      : new Date(base.timestamp as string | number);
  const createdAt = base.createdAt
    ? base.createdAt instanceof Date
      ? base.createdAt
      : new Date(base.createdAt as string | number)
    : undefined;

  let parts = base.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    if (typeof content === "string") {
      parts = [{ type: "text", text: content }];
    } else {
      parts = [];
    }
  }

  return {
    ...base,
    parts: parts as ChatMessage["parts"],
    timestamp,
    createdAt,
  } as ChatMessage;
}

function serializeChatMeta(chat: Chat): PersistedChatMeta {
  const { messages: _messages, subagentSessions: _subagentSessions, compactionSummary, ...meta } = chat;
  return {
    ...meta,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    compactionSummary: compactionSummary
      ? { ...compactionSummary, createdAt: compactionSummary.createdAt.toISOString() }
      : undefined,
  };
}

function serializeSubagentSessions(
  sessions: Record<string, SubagentSession> | undefined
): Record<string, PersistedSubagentSession> | undefined {
  if (!sessions) return undefined;
  return Object.fromEntries(
    Object.entries(sessions).map(([toolCallId, session]) => [
      toolCallId,
      {
        ...session,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    ])
  );
}

function serializeChatMessages(chat: Chat): PersistedChatMessages {
  return {
    id: chat.id,
    messages: chat.messages.map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
      createdAt: message.createdAt?.toISOString(),
    })),
    subagentSessions: serializeSubagentSessions(chat.subagentSessions),
  };
}

function deserializeSubagentSessions(
  sessions: unknown
): Record<string, SubagentSession> {
  if (!sessions || typeof sessions !== "object") return {};
  return Object.fromEntries(
    Object.entries(sessions as Record<string, PersistedSubagentSession>).map(
      ([toolCallId, session]) => [
        toolCallId,
        {
          ...session,
          messages: Array.isArray(session.messages) ? session.messages : [],
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
        },
      ]
    )
  );
}

function deserializeChatMeta(record: Record<string, unknown>): Omit<Chat, "messages"> {
  return {
    ...(record as Omit<Chat, "createdAt" | "updatedAt" | "messages" | "compactionSummary">),
    createdAt: new Date(record.createdAt as string | number | Date),
    updatedAt: new Date(record.updatedAt as string | number | Date),
    compactionSummary: record.compactionSummary
      ? {
          ...(record.compactionSummary as object),
          createdAt: new Date(
            (record.compactionSummary as { createdAt: string | number | Date })
              .createdAt
          ),
        } as CompactionSummary
      : undefined,
  };
}

function deserializeLegacyChat(record: Record<string, unknown>): Chat {
  return {
    ...deserializeChatMeta(record),
    messages: Array.isArray(record.messages)
      ? (record.messages as Record<string, unknown>[]).map((message) =>
          normalizeStoredMessage(message)
        )
      : [],
    subagentSessions: deserializeSubagentSessions(record.subagentSessions),
  };
}

class ChatStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  private async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        // Server-side rendering - return empty promise
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onblocked = () => {
        reject(
          new Error(
            "IndexedDB upgrade was blocked by another open Orion tab. Close other Orion tabs and refresh to load persisted chat history."
          )
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Fresh install — create the store
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(CHAT_META_STORE)) {
          const store = db.createObjectStore(CHAT_META_STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(CHAT_MESSAGE_STORE)) {
          db.createObjectStore(CHAT_MESSAGE_STORE, { keyPath: "id" });
        }
        // V1 → V2: no schema changes needed (compactionSummary is a new
        // optional field; existing records simply won't have it).
        // V2 → V3: split chat metadata from message payloads so history lists
        // can load without hydrating every long conversation.
        if (transaction && db.objectStoreNames.contains(STORE_NAME)) {
          const legacyStore = transaction.objectStore(STORE_NAME);
          const metaStore = transaction.objectStore(CHAT_META_STORE);
          const messageStore = transaction.objectStore(CHAT_MESSAGE_STORE);
          const cursorRequest = legacyStore.openCursor();

          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const legacyChat = deserializeLegacyChat(cursor.value as Record<string, unknown>);
            metaStore.put(serializeChatMeta(legacyChat));
            messageStore.put(serializeChatMessages(legacyChat));
            cursor.continue();
          };
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get all chats from IndexedDB
   */
  async getChats(): Promise<Chat[]> {
    await this.init();

    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const chats = request.result.map((chat: Record<string, unknown>) => {
          const c: Chat = {
            ...(chat as Omit<
              Chat,
              "createdAt" | "updatedAt" | "messages" | "compactionSummary"
            >),
            createdAt: new Date(chat.createdAt as string),
            updatedAt: new Date(chat.updatedAt as string),
            messages: (chat.messages as Record<string, unknown>[]).map((m) =>
              normalizeStoredMessage(m)
            ),
            subagentSessions: deserializeSubagentSessions(chat.subagentSessions),
            compactionSummary: chat.compactionSummary
              ? {
                  ...(chat.compactionSummary as object),
                  createdAt: new Date(
                    (chat.compactionSummary as { createdAt: string | number | Date })
                      .createdAt
                  ),
                } as CompactionSummary
              : undefined,
          };
          return c;
        });

        // Sort by updatedAt descending (most recent first)
        chats.sort(
          (a: Chat, b: Chat) => b.updatedAt.getTime() - a.updatedAt.getTime()
        );
        resolve(chats);
      };

      request.onerror = () => {
        reject(new Error("Failed to get chats from IndexedDB"));
      };
    });
  }

  /**
   * Get chat metadata only. Message arrays are intentionally empty so history
   * UI can render without loading every long conversation body.
   */
  async getChatMetas(): Promise<Chat[]> {
    await this.init();

    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHAT_META_STORE], "readonly");
      const store = transaction.objectStore(CHAT_META_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const chats = request.result.map((record: Record<string, unknown>) => ({
          ...deserializeChatMeta(record),
          messages: [],
        }));
        chats.sort(
          (a: Chat, b: Chat) => b.updatedAt.getTime() - a.updatedAt.getTime()
        );
        resolve(chats);
      };

      request.onerror = () => {
        reject(new Error("Failed to get chat metadata from IndexedDB"));
      };
    });
  }

  /**
   * Save a single chat to IndexedDB
   */
  async saveChat(chat: Chat): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NAME, CHAT_META_STORE, CHAT_MESSAGE_STORE],
        "readwrite"
      );
      const legacyStore = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(CHAT_META_STORE);
      const messageStore = transaction.objectStore(CHAT_MESSAGE_STORE);

      // Prepare chat data for storage
      const chatData = {
        ...chat,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        messages: chat.messages.map((message) => ({
          ...message,
          timestamp: message.timestamp.toISOString(),
          createdAt: message.createdAt?.toISOString(),
        })),
        subagentSessions: serializeSubagentSessions(chat.subagentSessions),
        compactionSummary: chat.compactionSummary
          ? { ...chat.compactionSummary, createdAt: chat.compactionSummary.createdAt.toISOString() }
          : undefined,
      };

      legacyStore.put(chatData);
      metaStore.put(serializeChatMeta(chat));
      messageStore.put(serializeChatMessages(chat));

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error("Failed to save chat to IndexedDB"));
      };
    });
  }

  /**
   * Save multiple chats to IndexedDB
   */
  async saveChats(chats: Chat[]): Promise<void> {
    await Promise.all(chats.map((chat) => this.saveChat(chat)));
  }

  /**
   * Delete a chat from IndexedDB
   */
  async deleteChat(chatId: string): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NAME, CHAT_META_STORE, CHAT_MESSAGE_STORE],
        "readwrite"
      );
      transaction.objectStore(STORE_NAME).delete(chatId);
      transaction.objectStore(CHAT_META_STORE).delete(chatId);
      transaction.objectStore(CHAT_MESSAGE_STORE).delete(chatId);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error("Failed to delete chat from IndexedDB"));
      };
    });
  }

  /**
   * Clear all chats from IndexedDB
   */
  async clearChats(): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NAME, CHAT_META_STORE, CHAT_MESSAGE_STORE],
        "readwrite"
      );
      transaction.objectStore(STORE_NAME).clear();
      transaction.objectStore(CHAT_META_STORE).clear();
      transaction.objectStore(CHAT_MESSAGE_STORE).clear();

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error("Failed to clear chats from IndexedDB"));
      };
    });
  }

  /**
   * Get a specific chat by ID
   */
  async getChat(chatId: string): Promise<Chat | undefined> {
    await this.init();

    if (!this.db) {
      return undefined;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NAME, CHAT_META_STORE, CHAT_MESSAGE_STORE],
        "readonly"
      );
      const metaRequest = transaction.objectStore(CHAT_META_STORE).get(chatId);
      const messagesRequest = transaction.objectStore(CHAT_MESSAGE_STORE).get(chatId);
      const legacyRequest = transaction.objectStore(STORE_NAME).get(chatId);

      transaction.oncomplete = () => {
        if (metaRequest.result && messagesRequest.result) {
          const meta = deserializeChatMeta(metaRequest.result as Record<string, unknown>);
          const messageRecord = messagesRequest.result as PersistedChatMessages;
          resolve({
            ...meta,
            messages: messageRecord.messages.map((message) =>
              normalizeStoredMessage(message as Record<string, unknown>)
            ),
            subagentSessions: deserializeSubagentSessions(
              messageRecord.subagentSessions
            ),
          });
          return;
        }

        if (legacyRequest.result) {
          resolve(deserializeLegacyChat(legacyRequest.result as Record<string, unknown>));
          return;
        }

        resolve(undefined);
      };

      transaction.onerror = () => {
        reject(new Error("Failed to get chat from IndexedDB"));
      };
    });
  }

  /**
   * Update or clear the compaction summary for a chat without re-saving all messages.
   */
  async updateCompactionSummary(
    chatId: string,
    summary: CompactionSummary | null
  ): Promise<void> {
    const chat = await this.getChat(chatId);
    if (!chat) return;
    await this.saveChat({
      ...chat,
      compactionSummary: summary ?? undefined,
      updatedAt: new Date(),
    });
  }

  /**
   * Migrate data from session storage to IndexedDB (one-time migration)
   */
  async migrateFromSessionStorage(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const storedChats = sessionStorage.getItem("chatHistory");
    if (!storedChats) {
      return;
    }

    try {
      const parsed = JSON.parse(storedChats) as Record<string, unknown>[];
      const chats: Chat[] = parsed.map((chat) => {
        const c: Chat = {
          ...(chat as Omit<Chat, "createdAt" | "updatedAt" | "messages">),
          createdAt: new Date(chat.createdAt as string),
          updatedAt: new Date(chat.updatedAt as string),
          messages: (chat.messages as Record<string, unknown>[]).map((m) =>
            normalizeStoredMessage(m)
          ),
          subagentSessions: deserializeSubagentSessions(chat.subagentSessions),
        };
        return c;
      });

      await this.saveChats(chats);

      // Clear session storage after successful migration
      sessionStorage.removeItem("chatHistory");
      console.log(
        "Successfully migrated chat history from session storage to IndexedDB"
      );
    } catch (error) {
      console.error(
        "Failed to migrate chat history from session storage:",
        error
      );
    }
  }
}

// Create and export a singleton instance
export const chatStorage = new ChatStorage();

// Export types and helpers for use in other files
export type { Chat, ChatMessage };
export { getTextContent };
