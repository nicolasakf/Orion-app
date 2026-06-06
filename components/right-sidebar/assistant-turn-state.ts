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
