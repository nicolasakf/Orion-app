import {
  ChatWireSchema,
  deserializeChat,
  getTextContent,
  serializeChat,
  type Chat,
  type ChatMessage,
  type CompactionSummary,
  type SubagentSession,
  type SubagentSessionStatus,
} from "@/lib/chat/chat-types";

const CHATS_API_PATH = "/api/chats";

/** Parses a JSON response body and throws a useful error for failed chat API calls. */
async function parseJsonResponse(response: Response): Promise<unknown> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Chat API returned ${response.status}`;
    throw new Error(message);
  }
  return body;
}

/** Client-side chat storage facade backed by Orion's local chat API. */
class ChatStorage {
  /** Get all chats with full message history. */
  async getChats(): Promise<Chat[]> {
    const response = await fetch(CHATS_API_PATH, { method: "GET" });
    const raw = await parseJsonResponse(response);
    const parsed = ChatWireSchema.array().safeParse(
      raw && typeof raw === "object" && "chats" in raw
        ? (raw as { chats: unknown }).chats
        : raw
    );
    if (!parsed.success) {
      throw new Error("Chat API returned invalid chats.");
    }
    return parsed.data.map(deserializeChat);
  }

  /**
   * Get chat metadata only. Message arrays are intentionally empty so history
   * UI can render without loading every long conversation body.
   */
  async getChatMetas(): Promise<Chat[]> {
    const response = await fetch(`${CHATS_API_PATH}?metadataOnly=true`, {
      method: "GET",
    });
    const raw = await parseJsonResponse(response);
    const parsed = ChatWireSchema.array().safeParse(
      raw && typeof raw === "object" && "chats" in raw
        ? (raw as { chats: unknown }).chats
        : raw
    );
    if (!parsed.success) {
      throw new Error("Chat API returned invalid chat metadata.");
    }
    return parsed.data.map(deserializeChat);
  }

  /** Save a single complete chat. */
  async saveChat(chat: Chat): Promise<void> {
    const response = await fetch(CHATS_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeChat(chat)),
    });
    if (!response.ok) {
      throw new Error(`Failed to save chat: ${response.status}`);
    }
  }

  /** Save multiple complete chats. */
  async saveChats(chats: Chat[]): Promise<void> {
    const response = await fetch(CHATS_API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chats: chats.map(serializeChat) }),
    });
    if (!response.ok) {
      throw new Error(`Failed to save chats: ${response.status}`);
    }
  }

  /** Delete a chat by id. */
  async deleteChat(chatId: string): Promise<void> {
    const response = await fetch(
      `${CHATS_API_PATH}/${encodeURIComponent(chatId)}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      throw new Error(`Failed to delete chat: ${response.status}`);
    }
  }

  /** Clear all chats. */
  async clearChats(): Promise<void> {
    const response = await fetch(CHATS_API_PATH, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(`Failed to clear chats: ${response.status}`);
    }
  }

  /** Get a specific chat by ID. */
  async getChat(chatId: string): Promise<Chat | undefined> {
    const response = await fetch(
      `${CHATS_API_PATH}/${encodeURIComponent(chatId)}`,
      { method: "GET" }
    );
    if (response.status === 404) return undefined;

    const raw = await parseJsonResponse(response);
    const parsed = ChatWireSchema.safeParse(
      raw && typeof raw === "object" && "chat" in raw
        ? (raw as { chat: unknown }).chat
        : raw
    );
    if (!parsed.success) {
      throw new Error("Chat API returned an invalid chat.");
    }
    return deserializeChat(parsed.data);
  }

  /** Update or clear the compaction summary for a chat without re-saving all messages. */
  async updateCompactionSummary(
    chatId: string,
    summary: CompactionSummary | null
  ): Promise<void> {
    const response = await fetch(
      `${CHATS_API_PATH}/${encodeURIComponent(chatId)}/compaction-summary`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: summary
            ? {
                ...summary,
                createdAt: summary.createdAt.toISOString(),
              }
            : null,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to update compaction summary: ${response.status}`);
    }
  }

  /** Legacy migration is intentionally disabled for the local storage refactor. */
  async migrateFromSessionStorage(): Promise<void> {
    return Promise.resolve();
  }
}

export const chatStorage = new ChatStorage();

export type {
  Chat,
  ChatMessage,
  CompactionSummary,
  SubagentSession,
  SubagentSessionStatus,
};
export { getTextContent };
