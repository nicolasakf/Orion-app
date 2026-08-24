import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";

import {
  isGoalContractProposalPart,
  isUndecidedGoalContractProposalPart,
} from "@/lib/agent/goals/contract-author";

/** True when a tool output was created by the user's Stop action. */
function isCancelledToolPart(part: UIMessage["parts"][number]): boolean {
  if (!part.type.startsWith("tool-")) return false;
  if ("errorText" in part && part.errorText === "cancelled_by_user") return true;
  const output = "output" in part ? part.output : undefined;
  if (typeof output !== "object" || output === null || Array.isArray(output)) return false;
  return (output as { error?: unknown }).error === "cancelled_by_user";
}

/**
 * True when a contract proposal is the reason the turn stopped.
 *
 * The AI SDK appends every follow-up step to the same assistant message, so an
 * approved proposal stays in `parts` for the whole goal. Testing "contains a
 * proposal" would therefore freeze the worker forever; the loop must only pause
 * while the proposal itself is the trailing tool call, or while any proposal in
 * the turn is still waiting on the user's approve/revise decision.
 */
function goalContractProposalEndsTurn(
  toolParts: UIMessage["parts"]
): boolean {
  const lastToolPart = toolParts.at(-1);
  if (lastToolPart && isGoalContractProposalPart(lastToolPart)) return true;
  return toolParts.some(isUndecidedGoalContractProposalPart);
}

/**
 * AI SDK's helper correctly resumes normal completed tool calls, but user-stopped
 * tool calls are terminal for the turn and must not keep the composer in queue mode.
 */
export function shouldContinueAfterToolCalls(messages: UIMessage[]): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;
  const lastAssistantMessage = messages.findLast((message) => message.role === "assistant");
  if (!lastAssistantMessage) return false;
  const toolParts = lastAssistantMessage.parts.filter((part) => part.type.startsWith("tool-"));
  if (goalContractProposalEndsTurn(toolParts)) return false;
  return !toolParts.some(isCancelledToolPart);
}

function isToolPart(part: UIMessage["parts"][number]): boolean {
  return part.type.startsWith("tool-");
}

function isCompletedToolPart(part: UIMessage["parts"][number]): boolean {
  return (
    isToolPart(part) &&
    "state" in part &&
    (part.state === "output-available" || part.state === "output-error")
  );
}

/**
 * Stable key for the completed tool result that would cause useChat to send an
 * automatic follow-up request. Used to avoid resubmitting the same result forever
 * if a provider returns an empty/non-tool response.
 */
export function getCompletedToolContinuationKey(messages: UIMessage[]): string | null {
  const lastAssistantMessage = messages.findLast((message) => message.role === "assistant");
  if (!lastAssistantMessage) return null;
  const allToolParts = lastAssistantMessage.parts.filter(isToolPart);
  if (goalContractProposalEndsTurn(allToolParts)) return null;
  // A decided proposal stays in the turn for the rest of the goal; key off the
  // real tool results so the key still advances on every worker step.
  const completedToolParts = lastAssistantMessage.parts.filter(
    (part) => isCompletedToolPart(part) && !isGoalContractProposalPart(part)
  );
  if (completedToolParts.length === 0) return null;
  if (completedToolParts.some(isCancelledToolPart)) return null;
  return completedToolParts
    .map((part) => {
      const toolCallId = "toolCallId" in part ? String(part.toolCallId) : "";
      const state = "state" in part ? String(part.state) : "";
      return `${part.type}:${toolCallId}:${state}`;
    })
    .join("|");
}

/**
 * Monotonic measure of how far a transcript has advanced.
 *
 * Message count alone is not enough: the AI SDK appends every follow-up step to
 * the existing trailing assistant message, so a whole worker turn can complete
 * without `messages.length` changing. Counting parts sees that growth.
 */
export function getTranscriptProgressCount(messages: UIMessage[]): number {
  return messages.reduce((total, message) => total + message.parts.length, 0);
}
