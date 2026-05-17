"use client";

/**
 * DevLoggerClient - Browser-side verbose logger for development mode
 *
 * POSTs log entries to /api/dev-log which writes them to the server log file.
 * All calls are fire-and-forget — they never throw or block the caller.
 * Only active when NODE_ENV === 'development'.
 */

const IS_DEV = process.env.NODE_ENV === "development";

export interface ClientLogEntry {
  category: string;
  payload: unknown;
  browserTimestamp: string;
  /** Chat ID for routing to logs/{chatId}.log */
  chatId?: string | null;
}

/**
 * Send a log entry to the server. Fire-and-forget.
 */
function sendLog(category: string, payload: unknown, chatId?: string | null): void {
  if (!IS_DEV) return;

  const entry: ClientLogEntry = {
    category,
    payload,
    browserTimestamp: new Date().toISOString(),
    chatId: chatId ?? undefined,
  };

  // Fire-and-forget — intentionally not awaited
  fetch("/api/dev-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {
    // Never throw from logging
  });
}

// ============================================================================
// Exported log helpers
// ============================================================================

/**
 * Log a client-side tool call dispatch.
 */
export function logToolDispatch(
  data: { requestId: string; toolName: string; params: unknown },
  chatId?: string | null
): void {
  sendLog("TOOL_DISPATCH", data, chatId);
}

/**
 * Log a client-side tool call result.
 */
export function logToolResult(
  data: {
    requestId: string;
    toolName: string;
    params: unknown;
    result: unknown;
    durationMs: number;
  },
  chatId?: string | null
): void {
  sendLog("TOOL_RESULT", data, chatId);
}

/**
 * Log a client-side tool call error.
 */
export function logToolError(
  data: {
    requestId: string;
    toolName: string;
    params: unknown;
    error: string;
    durationMs: number;
  },
  chatId?: string | null
): void {
  sendLog("TOOL_ERROR", data, chatId);
}

/**
 * Log the exact shell command executed for pool-backed tools.
 */
export function logToolShellCommand(
  data: { toolName: string; shellCommand: string },
  chatId?: string | null
): void {
  sendLog("TOOL_SHELL_COMMAND", data, chatId);
}

/**
 * Log context bundle build from the client.
 */
export function logContextBuildClient(
  data: {
    conversationHistoryLength: number;
    selectedCellCount: number;
    bundleMetadata: unknown;
  },
  chatId?: string | null
): void {
  sendLog("CONTEXT_BUILD_CLIENT", data, chatId);
}

/**
 * Log useChat hook events (message received, submit, etc.).
 */
export function logChatHookEvent(data: {
  event: "submit" | "message_received" | "tool_invocation" | "error" | "finish";
  details: unknown;
}): void {
  sendLog("CHAT_HOOK", data);
}
