import type { Chat, ChatMessage, SubagentSession } from "@/lib/chat/chat-types";

export type ChatForkKind = "edit-resend" | "fork-from-message";

export interface CreateChatForkOptions {
  sourceChat: Chat;
  sourceMessageIndex: number;
  kind: ChatForkKind;
  forkId: string;
  now: Date;
}

/** Returns true when an unknown value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Collects tool call ids from nested UI message parts. */
function collectToolCallIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolCallIds(item, ids);
    }
    return;
  }

  if (!isRecord(value)) return;

  if (typeof value.toolCallId === "string") {
    ids.add(value.toolCallId);
  }

  for (const child of Object.values(value)) {
    collectToolCallIds(child, ids);
  }
}

/** Keeps only sub-agent sessions that still have tool-call references in copied messages. */
function filterSubagentSessions(
  messages: ChatMessage[],
  sessions: Record<string, SubagentSession> | undefined
): Record<string, SubagentSession> | undefined {
  if (!sessions) return undefined;

  const copiedToolCallIds = new Set<string>();
  for (const message of messages) {
    collectToolCallIds(message.parts, copiedToolCallIds);
  }

  const filtered = Object.fromEntries(
    Object.entries(sessions).filter(([toolCallId]) => copiedToolCallIds.has(toolCallId))
  );
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

/** Builds a stable, readable title for a chat fork. */
function buildForkTitle(sourceTitle: string): string {
  const baseTitle = sourceTitle.trim() || "New Chat";
  return baseTitle.startsWith("Fork: ") ? baseTitle : `Fork: ${baseTitle}`;
}

/**
 * Creates a chat fork from a user message boundary.
 * Edit-resend excludes the edited message; fork-from-message includes it.
 */
export function createChatFork(options: CreateChatForkOptions): Chat {
  const sourceMessage = options.sourceChat.messages[options.sourceMessageIndex];
  if (!sourceMessage) {
    throw new Error("Cannot fork chat: source message does not exist.");
  }

  const lastCopiedIndex =
    options.kind === "edit-resend"
      ? options.sourceMessageIndex - 1
      : options.sourceMessageIndex;
  const messages = options.sourceChat.messages.slice(0, Math.max(0, lastCopiedIndex + 1));
  const copiedMessageIds = new Set(messages.map((message) => message.id));
  const compactionSummary =
    options.sourceChat.compactionSummary &&
    copiedMessageIds.has(options.sourceChat.compactionSummary.coversThrough)
      ? options.sourceChat.compactionSummary
      : undefined;

  return {
    id: options.forkId,
    title: buildForkTitle(options.sourceChat.title),
    messages,
    subagentSessions: filterSubagentSessions(
      messages,
      options.sourceChat.subagentSessions
    ),
    createdAt: options.now,
    updatedAt: options.now,
    compactionSummary,
    forkedFrom: {
      sourceChatId: options.sourceChat.id,
      sourceMessageId: sourceMessage.id,
      sourceMessageIndex: options.sourceMessageIndex,
      mode:
        options.kind === "edit-resend"
          ? "edit_resend"
          : "fork_from_message",
      createdAt: options.now,
    },
  };
}
