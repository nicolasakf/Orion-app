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
import type { SupportedProvider } from "@/lib/agent/model-gateway-types";
import { HARD_CAP_TOKENS, COMPACTION_RETENTION_TURNS, estimateMessageTokens } from "./token-budget";

export interface CompactionResult {
  summary: CompactionSummary;
  /** Estimated input tokens before compaction (wire payload). */
  tokensBefore: number;
  /** Estimated input tokens after compaction (wire payload). */
  tokensAfter: number;
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

/** Rough token estimate for a simple messages array (no system prompt). */
function roughTokenEstimate(messages: UIMessage[]): number {
  return estimateMessageTokens(messages, "", { contextWindow: HARD_CAP_TOKENS }).totalTokens;
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
    userCredential?: unknown;
    model: string;
    provider: SupportedProvider;
  }
): Promise<CompactionResult> {
  const retentionTurns = opts.retentionTurns ?? COMPACTION_RETENTION_TURNS;
  const boundaryIdx = findRetentionBoundary(messages, retentionTurns);

  const older = messages.slice(0, boundaryIdx);
  const recent = messages.slice(boundaryIdx);

  // If nothing to compact, treat the whole conversation as the summary target
  const toSummarize = older.length > 0 ? older : messages;
  const coversThrough =
    older.length > 0
      ? (older[older.length - 1].id ?? "")
      : (messages[messages.length - 1]?.id ?? "");

  const tokensBefore = roughTokenEstimate(messages);

  const { summaryText, tokensUsed } = await callCompactionApi(
    toSummarize,
    opts.previousSummary?.text,
    opts.userCredential,
    opts.model,
    opts.provider,
    opts.chatId
  );

  // Estimate tokens after: synthetic summary pair + recent turns
  const syntheticChars = `Prior conversation summary:\n${summaryText}\nGot it. Continuing from here.`.length;
  const recentTokens = roughTokenEstimate(recent);
  const tokensAfter = Math.ceil(syntheticChars / 3.7) + recentTokens;

  const summary: CompactionSummary = {
    text: summaryText,
    coversThrough,
    createdAt: new Date(),
    model: opts.model,
    tokensSaved: Math.max(0, tokensBefore - tokensAfter),
  };

  return { summary, tokensBefore, tokensAfter };
}
