import type { Chat, ChatMessage, SubagentSession } from "@/lib/chat/chat-types";
import type { EditCheckpointStatus } from "@/lib/agent/edit-checkpoints";

export interface CreateChatForkOptions {
  sourceChat: Chat;
  sourceMessageIndex: number;
  forkId: string;
  now: Date;
}

export interface TruncateChatForInPlaceEditOptions {
  sourceChat: Chat;
  sourceMessageIndex: number;
  now: Date;
}

export interface GetInPlaceEditRestoreCheckpointIdsOptions {
  sourceChat: Chat;
  sourceMessageIndex: number;
  checkpointRequestByMessageId: ReadonlyMap<string, string>;
  checkpointStatuses: ReadonlyMap<string, EditCheckpointStatus>;
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
 * Returns a compaction summary only when its inclusive boundary remains in
 * retained history. A summary at or after an edited user message is stale.
 */
function retainCompactionSummaryThrough(
  sourceChat: Chat,
  lastRetainedMessageIndex: number
): Chat["compactionSummary"] {
  const summary = sourceChat.compactionSummary;
  if (!summary) return undefined;

  const summaryIndex = sourceChat.messages.findIndex(
    (message) => message.id === summary.coversThrough
  );

  return summaryIndex >= 0 && summaryIndex <= lastRetainedMessageIndex
    ? summary
    : undefined;
}

/**
 * Creates a new chat fork through an assistant message boundary, preserving
 * only context that is valid for the new branch.
 */
export function createChatFork(options: CreateChatForkOptions): Chat {
  const sourceMessage = options.sourceChat.messages[options.sourceMessageIndex];
  if (!sourceMessage) {
    throw new Error("Cannot fork chat: source message does not exist.");
  }
  if (sourceMessage.role !== "assistant") {
    throw new Error("Cannot fork chat: source message must be an assistant message.");
  }

  const messages = options.sourceChat.messages.slice(0, options.sourceMessageIndex + 1);

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
    compactionSummary: retainCompactionSummaryThrough(
      options.sourceChat,
      options.sourceMessageIndex
    ),
    forkedFrom: {
      sourceChatId: options.sourceChat.id,
      sourceMessageId: sourceMessage.id,
      sourceMessageIndex: options.sourceMessageIndex,
      mode: "fork_from_message",
      createdAt: options.now,
    },
  };
}

/**
 * Truncates a chat in place before resending an edited user message. The
 * selected message keeps its id for AI SDK replacement but loses the prior
 * request checkpoint so the regenerated turn can record a fresh one.
 */
export function truncateChatForInPlaceEdit(
  options: TruncateChatForInPlaceEditOptions
): Chat {
  const sourceMessage = options.sourceChat.messages[options.sourceMessageIndex];
  if (!sourceMessage) {
    throw new Error("Cannot edit chat history: source message does not exist.");
  }
  if (sourceMessage.role !== "user") {
    throw new Error("Cannot edit chat history: source message must be a user message.");
  }

  const { checkpointId: _previousCheckpointId, ...editedMessage } = sourceMessage;
  const messages: ChatMessage[] = [
    ...options.sourceChat.messages.slice(0, options.sourceMessageIndex),
    editedMessage,
  ];

  return {
    ...options.sourceChat,
    messages,
    subagentSessions: filterSubagentSessions(
      messages,
      options.sourceChat.subagentSessions
    ),
    compactionSummary: retainCompactionSummaryThrough(
      options.sourceChat,
      options.sourceMessageIndex - 1
    ),
    updatedAt: options.now,
  };
}

/**
 * Returns non-empty workspace checkpoints created at or after an edited user
 * message, newest first. Checkpoint ids are attached to every agent request,
 * including requests that did not edit the workspace, so only ids present in
 * checkpointStatuses can be restored.
 */
export function getInPlaceEditRestoreCheckpointIds(
  options: GetInPlaceEditRestoreCheckpointIdsOptions
): string[] {
  const checkpointIds: string[] = [];

  for (
    let index = options.sourceChat.messages.length - 1;
    index >= options.sourceMessageIndex;
    index -= 1
  ) {
    const message = options.sourceChat.messages[index];
    if (!message || message.role !== "user") continue;

    const checkpointId =
      message.checkpointId ?? options.checkpointRequestByMessageId.get(message.id);
    const checkpointStatus = checkpointId
      ? options.checkpointStatuses.get(checkpointId)
      : undefined;
    if (!checkpointId || !checkpointStatus || checkpointStatus === "reverted") continue;

    checkpointIds.push(checkpointId);
  }

  return checkpointIds;
}
