import { z } from "zod";

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
  /**
   * Set when the summary absorbed the user turn that is still being worked on
   * (an overflow inside a single agent turn). Wire payloads re-issue this
   * message after the summary so the model still has an instruction to act on.
   */
  resumeFromMessageId?: string;
}

export type ChatForkMode = "edit_resend" | "fork_from_message";

export interface ChatForkMetadata {
  sourceChatId: string;
  sourceMessageId: string;
  sourceMessageIndex: number;
  mode: ChatForkMode;
  createdAt: Date;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  subagentSessions?: Record<string, SubagentSession>;
  createdAt: Date;
  updatedAt: Date;
  /** Set when the conversation has been compacted. Wire payloads replay from summary. */
  compactionSummary?: CompactionSummary;
  /** Records the source chat/message when this chat was branched from history. */
  forkedFrom?: ChatForkMetadata;
}

/** ChatMessage extends UIMessage with additional Orion-specific fields. */
export interface ChatMessage extends UIMessage<ChatMessageMetadata> {
  timestamp: Date;
  modelUsed?: string;
  checkpointId?: string;
  createdAt?: Date;
}

const DateStringSchema = z.string().datetime();

export const CompactionSummaryWireSchema = z.object({
  text: z.string(),
  coversThrough: z.string(),
  createdAt: DateStringSchema,
  model: z.string(),
  tokensSaved: z.number(),
  resumeFromMessageId: z.string().optional(),
});

export const ChatForkMetadataWireSchema = z.object({
  sourceChatId: z.string(),
  sourceMessageId: z.string(),
  sourceMessageIndex: z.number().int().min(0),
  mode: z.enum(["edit_resend", "fork_from_message"]),
  createdAt: DateStringSchema,
});

export const SubagentSessionWireSchema = z
  .object({
    subagentType: z.string(),
    label: z.string(),
    description: z.string(),
    status: z.enum(["running", "completed", "error", "cancelled"]),
    messages: z.array(z.unknown()),
    tmpNotebookPath: z.string().optional(),
    subagentDevLogInstance: z.number().optional(),
    reconnectedFromToolCallId: z.string().optional(),
    summary: z.string().optional(),
    errorText: z.string().optional(),
    stepsUsed: z.number().optional(),
    stoppedByLimit: z.boolean().optional(),
    createdAt: DateStringSchema,
    updatedAt: DateStringSchema,
  })
  .passthrough();

export const ChatMessageWireSchema = z
  .object({
    id: z.string(),
    role: z.string(),
    parts: z.array(z.unknown()),
    timestamp: DateStringSchema,
    modelUsed: z.string().optional(),
    checkpointId: z.string().optional(),
    createdAt: DateStringSchema.optional(),
  })
  .passthrough();

export const ChatWireSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(ChatMessageWireSchema),
  subagentSessions: z.record(SubagentSessionWireSchema).optional(),
  createdAt: DateStringSchema,
  updatedAt: DateStringSchema,
  compactionSummary: CompactionSummaryWireSchema.optional(),
  forkedFrom: ChatForkMetadataWireSchema.optional(),
});

export type ChatWire = z.infer<typeof ChatWireSchema>;

/** Extract text content from a UIMessage's parts. */
export function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Converts a persisted or wire chat payload into the client-side chat shape. */
export function deserializeChat(chat: ChatWire): Chat {
  return {
    ...chat,
    createdAt: new Date(chat.createdAt),
    updatedAt: new Date(chat.updatedAt),
    messages: chat.messages.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
      createdAt: message.createdAt ? new Date(message.createdAt) : undefined,
    })) as ChatMessage[],
    subagentSessions: chat.subagentSessions
      ? Object.fromEntries(
          Object.entries(chat.subagentSessions).map(([toolCallId, session]) => [
            toolCallId,
            {
              ...session,
              messages: session.messages as UIMessage[],
              createdAt: new Date(session.createdAt),
              updatedAt: new Date(session.updatedAt),
            },
          ])
        )
      : undefined,
    compactionSummary: chat.compactionSummary
      ? {
          ...chat.compactionSummary,
          createdAt: new Date(chat.compactionSummary.createdAt),
        }
      : undefined,
    forkedFrom: chat.forkedFrom
      ? {
          ...chat.forkedFrom,
          createdAt: new Date(chat.forkedFrom.createdAt),
        }
      : undefined,
  };
}

/** Converts a client-side chat into the JSON wire shape used by APIs and SQLite. */
export function serializeChat(chat: Chat): ChatWire {
  return {
    ...chat,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    messages: chat.messages.map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
      createdAt: message.createdAt?.toISOString(),
    })),
    subagentSessions: chat.subagentSessions
      ? Object.fromEntries(
          Object.entries(chat.subagentSessions).map(([toolCallId, session]) => [
            toolCallId,
            {
              ...session,
              createdAt: session.createdAt.toISOString(),
              updatedAt: session.updatedAt.toISOString(),
            },
          ])
        )
      : undefined,
    compactionSummary: chat.compactionSummary
      ? {
          ...chat.compactionSummary,
          createdAt: chat.compactionSummary.createdAt.toISOString(),
        }
      : undefined,
    forkedFrom: chat.forkedFrom
      ? {
          ...chat.forkedFrom,
          createdAt: chat.forkedFrom.createdAt.toISOString(),
        }
      : undefined,
  };
}
