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
import { COMPACTION_RETENTION_TURNS } from "./token-budget";

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
  }
): Promise<CompactionResult> {
  const retentionTurns = opts.retentionTurns ?? COMPACTION_RETENTION_TURNS;
  const boundaryIdx = findRetentionBoundary(messages, retentionTurns);

  const older = messages.slice(0, boundaryIdx);
  // If nothing to compact, treat the whole conversation as the summary target
  const toSummarize = older.length > 0 ? older : messages;
  const coversThrough =
    older.length > 0
      ? (older[older.length - 1].id ?? "")
      : (messages[messages.length - 1]?.id ?? "");

  const { summaryText } = await callCompactionApi(
    toSummarize,
    opts.previousSummary?.text,
    opts.model,
    opts.provider,
    opts.chatId
  );

  const summary: CompactionSummary = {
    text: summaryText,
    coversThrough,
    createdAt: new Date(),
    model: opts.model,
    // The caller replaces this with before/after server preflight measurements.
    tokensSaved: 0,
  };

  return { summary };
}
