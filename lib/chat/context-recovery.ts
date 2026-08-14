import type { UIMessage } from "ai";

import type { ContextPreflightResult } from "@/lib/agent/context-preflight";
import type { CompactionSummary } from "@/lib/chat/chat-storage";

interface ContextRecoveryOptions {
  messages: UIMessage[];
  previousSummary?: CompactionSummary;
  preflight: (messages: UIMessage[]) => Promise<ContextPreflightResult | null>;
  compact: () => Promise<CompactionSummary>;
  persistSummary: (summary: CompactionSummary) => Promise<void>;
  applySummary: (summary: CompactionSummary) => void;
  restoreMessages: (messages: UIMessage[]) => void;
  resend: () => void;
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

  const after = await options.preflight(options.messages);
  const tokensSaved =
    before && after
      ? Math.max(
          0,
          before.measurement.estimatedInputTokens -
            after.measurement.estimatedInputTokens
        )
      : 0;
  if (before && after && tokensSaved === 0) {
    throw new Error("Compaction did not reduce the measured request context.");
  }
  if (after?.measurement.status === "over") {
    throw new Error("The request remains over the selected model context budget.");
  }

  const measuredSummary = { ...compacted, tokensSaved };
  await options.persistSummary(measuredSummary);
  options.applySummary(measuredSummary);
  options.restoreMessages(options.messages);
  options.resend();
  return measuredSummary;
}
