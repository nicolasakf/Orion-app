import type { UIMessage } from "ai";

import { isSyntheticCompactionMessageId } from "@/lib/agent/context-optimizer";
import { exceedsContextBudget, type ContextMeasurement } from "@/lib/agent/context-usage";
import type { CompactionSummary } from "@/lib/chat/chat-storage";

interface ContextRecoveryOptions {
  messages: UIMessage[];
  previousSummary?: CompactionSummary;
  preflight: (messages: UIMessage[]) => Promise<ContextMeasurement | null>;
  compact: () => Promise<CompactionSummary>;
  persistSummary: (summary: CompactionSummary) => Promise<void>;
  applySummary: (summary: CompactionSummary) => void;
  restoreMessages: (messages: UIMessage[]) => void;
  /**
   * Rebuilds the wire payload the retry would send, so the attempt can confirm
   * the model still has an instruction to act on. Omitted only by callers that
   * cannot construct one.
   */
  buildPayload?: (messages: UIMessage[]) => UIMessage[];
  resend: () => void;
}

/**
 * True when a payload still carries a real user instruction. A payload of only
 * synthetic compaction turns measures small and passes every token check, but
 * gives the model nothing to do.
 */
function hasActionableUserMessage(messages: UIMessage[]): boolean {
  return messages.some(
    (message) => message.role === "user" && !isSyntheticCompactionMessageId(message.id)
  );
}

/** True only while the current model turn is eligible for its single recovery attempt. */
export function canStartContextRecovery(options: {
  isContextError: boolean;
  alreadyAttempted: boolean;
  compactionInFlight: boolean;
  hasChatId: boolean;
}): boolean {
  return (
    options.isContextError &&
    !options.alreadyAttempted &&
    !options.compactionInFlight &&
    options.hasChatId
  );
}

/**
 * Compacts, persists, verifies, and resends one exact outbound message snapshot.
 * The caller owns the per-turn attempt guard and must set it before invoking this function.
 */
export async function runContextRecoveryAttempt(
  options: ContextRecoveryOptions
): Promise<CompactionSummary> {
  const before = await options.preflight(options.messages);
  const compacted = await options.compact();
  const summaryAdvanced =
    compacted.coversThrough !== options.previousSummary?.coversThrough ||
    compacted.text !== options.previousSummary?.text;
  if (!summaryAdvanced) {
    throw new Error("Compaction did not cover any additional conversation history.");
  }

  options.applySummary(compacted);
  await options.persistSummary(compacted);

  // A cheaper payload is not automatically a useful one — check that the retry
  // still contains the turn being resumed before spending a request on it.
  if (options.buildPayload && !hasActionableUserMessage(options.buildPayload(options.messages))) {
    throw new Error(
      "Compaction removed the request being retried, so there is nothing left to resend."
    );
  }

  const after = await options.preflight(options.messages);
  if (!before || !after) {
    throw new Error(
      "Context measurement is unavailable, so the compacted request cannot be verified."
    );
  }

  const tokensSaved = Math.max(0, before.inputTokens - after.inputTokens);
  if (tokensSaved === 0) {
    throw new Error("Compaction did not reduce the measured request context.");
  }
  // Deliberately the strict check: a request merely above the compaction
  // threshold still fits, and failing recovery for it would be a false alarm.
  if (exceedsContextBudget(after)) {
    throw new Error("The request remains over the selected model context budget.");
  }

  const measuredSummary = { ...compacted, tokensSaved };
  await options.persistSummary(measuredSummary);
  options.applySummary(measuredSummary);
  options.restoreMessages(options.messages);
  options.resend();
  return measuredSummary;
}
