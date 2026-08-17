/**
 * Conversation compaction via a cheap side-channel LLM call.
 *
 * Non-destructive: the stored UIMessage array is never modified. Only the
 * CompactionSummary artifact is persisted via the chat API. The wire payload is
 * rebuilt on every send from the summary + recent turns by `buildWirePayload`.
 */

import type { UIMessage } from "ai";
import { callCompactionApi } from "@/lib/chat/compaction-client";
import type { CompactionSummary } from "@/lib/chat/chat-storage";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import type { AgentContextSettings } from "@/lib/settings/schema";
import { COMPACTION_RETENTION_TURNS } from "./token-budget";

const COMPACTION_TOOL_INPUT_MAX_CHARS = 6_000;
const COMPACTION_TOOL_OUTPUT_MAX_CHARS = 12_000;

export interface CompactionResult {
  summary: CompactionSummary;
}

/**
 * Find the first message index in the "recent turns" window.
 * Returns the index of the earliest message that should be kept verbatim.
 */
function findRetentionBoundary(messages: UIMessage[], retentionTurns: number): number {
  let userTurnCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userTurnCount++;
      if (userTurnCount >= retentionTurns) {
        return i;
      }
    }
  }
  return 0;
}

/** Serializes a value for summarization while replacing binary data and bounding bulky payloads. */
function serializeCompactionValue(value: unknown, maxChars: number): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, (_key, nested) => {
      if (
        typeof nested === "string" &&
        (nested.startsWith("data:image/") || nested.startsWith("data:application/"))
      ) {
        return `[binary data omitted: ${nested.length} chars]`;
      }
      return nested;
    });
  } catch {
    serialized = String(value);
  }

  if (serialized.length <= maxChars) return serialized;
  return `${serialized.slice(0, maxChars)}\n[truncated from ${serialized.length} chars for compaction]`;
}

/** Converts rich UI parts into compact text that is safe to send to a summarization model. */
function serializeCompactionPart(part: UIMessage["parts"][number]): string {
  const record = part as unknown as Record<string, unknown>;
  if (part.type === "text" && typeof record.text === "string") return record.text;

  if (part.type === "file") {
    const mediaType = typeof record.mediaType === "string" ? record.mediaType : "unknown type";
    const filename = typeof record.filename === "string" ? ` ${record.filename}` : "";
    return `[Attached file${filename} (${mediaType}) omitted from compaction input]`;
  }

  if (part.type.startsWith("tool-")) {
    const toolName = part.type.slice("tool-".length);
    const lines = [`Tool ${toolName}`];
    if ("input" in record) {
      lines.push(
        `Input: ${serializeCompactionValue(record.input, COMPACTION_TOOL_INPUT_MAX_CHARS)}`
      );
    }
    if ("output" in record) {
      lines.push(
        `Output: ${serializeCompactionValue(record.output, COMPACTION_TOOL_OUTPUT_MAX_CHARS)}`
      );
    }
    if (typeof record.errorText === "string") lines.push(`Error: ${record.errorText}`);
    return lines.join("\n");
  }

  if (typeof record.text === "string") return record.text;
  return `[${part.type} part omitted from compaction input]`;
}

/** Produces text-only messages for compaction without mutating persisted chat history. */
export function prepareMessagesForCompaction(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: [
      {
        type: "text" as const,
        text: message.parts.map(serializeCompactionPart).filter(Boolean).join("\n\n"),
      },
    ],
  }));
}

/** Returns the first message not represented by the existing summary. */
function findUncoveredStart(
  messages: UIMessage[],
  previousSummary: CompactionSummary | undefined
): number {
  if (!previousSummary?.coversThrough) return 0;
  const coveredIndex = messages.findIndex(
    (message) => message.id === previousSummary.coversThrough
  );
  return coveredIndex >= 0 ? coveredIndex + 1 : 0;
}

/**
 * Run conversation compaction:
 * 1. Split messages into `older` (to summarize) and `recent` (to keep verbatim).
 * 2. Call the compaction API to get a summary of `older`.
 * 3. Return a `CompactionSummary` artifact.
 *
 * Callers are responsible for persisting the summary via
 * `chatStorage.updateCompactionSummary(chatId, result.summary)`.
 */
export async function compactConversation(
  messages: UIMessage[],
  opts: {
    chatId: string;
    retentionTurns?: number;
    previousSummary?: CompactionSummary;
    model: string;
    provider: ProviderId;
    /** Forwarded so the server fits summary chunks against the user's threshold. */
    contextSettings?: AgentContextSettings;
  }
): Promise<CompactionResult> {
  const retentionTurns = opts.retentionTurns ?? COMPACTION_RETENTION_TURNS;
  const boundaryIdx = findRetentionBoundary(messages, retentionTurns);
  const uncoveredStart = findUncoveredStart(messages, opts.previousSummary);
  const older = messages.slice(uncoveredStart, boundaryIdx);

  if (older.length === 0 && opts.previousSummary) {
    return { summary: opts.previousSummary };
  }

  // A single oversized turn may have no older prefix. In that case summarize
  // the uncovered conversation rather than resending already-covered history.
  const uncoveredMessages = messages.slice(uncoveredStart);
  const toSummarize = older.length > 0 ? older : uncoveredMessages;
  const preparedMessages = prepareMessagesForCompaction(toSummarize);
  const requestedCoversThrough = toSummarize.at(-1)?.id ?? "";

  if (preparedMessages.length === 0) {
    throw new Error("No uncovered conversation history is available to compact.");
  }

  // When the retention window came up empty the summary swallows the live user
  // instruction along with the tool loop, leaving the retry with nothing to act
  // on. Record it so the wire payload can re-issue it after the summary. The
  // live instruction is always the last user message, which is only the same as
  // `boundaryIdx` when retention is a single turn.
  const liveUserIdx = findRetentionBoundary(messages, 1);
  const liveUserMessage =
    messages[liveUserIdx]?.role === "user" ? messages[liveUserIdx] : undefined;
  const resumeFromMessageId =
    older.length === 0 && liveUserMessage ? liveUserMessage.id : undefined;

  const { summaryText, coversThrough: responseCoversThrough } = await callCompactionApi(
    preparedMessages,
    opts.previousSummary?.text,
    opts.model,
    opts.provider,
    opts.chatId,
    opts.contextSettings
  );

  const summary: CompactionSummary = {
    text: summaryText,
    coversThrough: responseCoversThrough || requestedCoversThrough,
    createdAt: new Date(),
    model: opts.model,
    // The caller replaces this with before/after server preflight measurements.
    tokensSaved: 0,
    ...(resumeFromMessageId ? { resumeFromMessageId } : {}),
  };

  return { summary };
}
