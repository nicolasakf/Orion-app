import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";

/** True when a tool output was created by the user's Stop action. */
function isCancelledToolPart(part: UIMessage["parts"][number]): boolean {
  if (!part.type.startsWith("tool-")) return false;
  if ("errorText" in part && part.errorText === "cancelled_by_user") return true;
  const output = "output" in part ? part.output : undefined;
  if (typeof output !== "object" || output === null || Array.isArray(output)) return false;
  return (output as { error?: unknown }).error === "cancelled_by_user";
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
  const completedToolParts = lastAssistantMessage.parts.filter(isCompletedToolPart);
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
