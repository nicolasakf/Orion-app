/**
 * DevLogger - Verbose file-based logger for development mode
 *
 * Writes under `logs/`: main chat uses `{chatId}.log`; subagent runs use
 * `{parentChatId}-{agentName}#{n}.log` (see `subagentDevLogFileStem`).
 * Only active when NODE_ENV === 'development'. All writes are no-ops in production.
 *
 * Server-side only (Node.js). Use logging/dev-logger-client for browser contexts.
 */

import { inspect } from "util";

// ============================================================================
// Config
// ============================================================================

const IS_DEV = process.env.NODE_ENV === "development";

const DIVIDER = "═".repeat(80);
const THIN_DIVIDER = "─".repeat(80);

/** Sanitize log file stem — allows `#` for subagent files like `{parentChatId}-{agentName}#1`. */
function sanitizeFileId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_#-]/g, "_");
}

/**
 * Dev log filename stem for a subagent run: `<parentChatId>-<agentName>#<instance>`.
 * `instance` is the Nth run of that agent type within the parent chat (client-supplied).
 */
export function subagentDevLogFileStem(args: {
  agentPromptVariant: string | undefined;
  subagentName?: string;
  instance: number;
  parentChatId: string;
}): string {
  const prefix = "subagent_";
  const name =
    args.subagentName ??
    (args.agentPromptVariant?.startsWith(prefix)
      ? args.agentPromptVariant.slice(prefix.length)
      : "subagent");
  return `${args.parentChatId}-${name}#${args.instance}`;
}

// ============================================================================
// Core write helper
// ============================================================================

/**
 * Write lines to the log file for the given chat/session.
 * @param lines - Lines to append
 * @param fileId - Chat ID or session ID (e.g. "session-{requestId}") for filename
 */
function write(lines: string[], fileId: string): void {
  if (!IS_DEV) return;
  if (typeof window !== "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePath = require("path") as typeof import("path");
    const logDir = nodePath.join(process.cwd(), "logs");
    const safeId = sanitizeFileId(fileId);
    const logFile = nodePath.join(logDir, `${safeId}.log`);
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, lines.join("\n") + "\n", "utf8");
  } catch {
    // Silently swallow write errors — never crash the app over logging
  }
}

// ============================================================================
// Formatting helpers
// ============================================================================

function ts(): string {
  return new Date().toISOString();
}

/** Left-pad a label so values align at column 14 */
function field(label: string, value: string | number | boolean | undefined | null): string {
  const padded = `${label}:`.padEnd(18);
  return `  ${padded} ${value ?? "(none)"}`;
}

/** Indent each line of a potentially multi-line string */
function indent(text: string, prefix = "    "): string {
  return text
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}

/** Truncate very long strings for the log so files don't explode */
function truncLog(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n    ...[truncated — ${text.length - max} more chars]`;
}

/** Max chars for non-system message bodies in dev logs (system prompts are logged in full). */
const TRUNC_CHAT_REQUEST = 2000;
const TRUNC_LLM_CALL = 3000;

function truncMessageBody(role: string, contentStr: string, defaultMax: number): string {
  if (role === "system") return contentStr;
  return truncLog(contentStr, defaultMax);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Serialize one model message part with text parts shown as normal readable text. */
function serializeMessagePartForLog(part: unknown, index: number): string {
  if (!isRecord(part)) {
    return serializeForLog(part);
  }

  if (part.type === "text" && typeof part.text === "string") {
    return part.text;
  }

  const type = typeof part.type === "string" ? part.type : `part-${index}`;
  return `[${type}]\n${serializeForLog(part)}`;
}

/** Serialize unknown message payloads safely for logs (always returns a string). */
function serializeForLog(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part, index) => serializeMessagePartForLog(part, index))
      .join("\n\n");
  }
  const asJson = JSON.stringify(value, null, 2);
  if (typeof asJson === "string") return asJson;
  return inspect(value, { depth: null, breakLength: 80 });
}

// ============================================================================
// Exported log functions
// ============================================================================

/**
 * Log an incoming /api/chat POST request.
 */
export function logChatRequest(data: {
  fileId: string;
  requestId: string;
  userId: string;
  model: string;
  provider: string;
  agentMode: boolean;
  messageCount: number;
  messages: Array<{ role: string; content: unknown }>;
  modelSettings?: Record<string, unknown> | null;
  contextMeta?: {
    notebookPath?: string | null;
    activeFilePath?: string | null;
    workspaceDirectory?: string | null;
  } | null;
}): void {
  if (!IS_DEV) return;

  const lines: string[] = [
    DIVIDER,
    `[${ts()}] [CHAT_REQUEST] id=${data.requestId}`,
    DIVIDER,
    field("User ID", data.userId),
    field("Model", data.model),
    field("Provider", data.provider),
    field("Agent Mode", data.agentMode),
    field("Msg Count", data.messageCount),
  ];

  if (data.modelSettings && Object.keys(data.modelSettings).length > 0) {
    lines.push("");
    lines.push("  Model Settings:");
    for (const [k, v] of Object.entries(data.modelSettings)) {
      lines.push(`    ${k}: ${JSON.stringify(v)}`);
    }
  }

  if (data.contextMeta) {
    const m = data.contextMeta;
    lines.push("");
    lines.push("  Agent Context:");
    if (m.notebookPath) lines.push(field("  Notebook", m.notebookPath));
    if (m.activeFilePath) lines.push(field("  Active File", m.activeFilePath));
    if (m.workspaceDirectory) lines.push(field("  Workspace", m.workspaceDirectory));
  }

  lines.push("");
  lines.push("  Messages:");
  data.messages.forEach((msg, i) => {
    const msgWithOptionalParts = msg as { parts?: unknown };
    const sourceForLog = msg.content !== undefined ? msg.content : msgWithOptionalParts.parts;
    const contentStr = serializeForLog(sourceForLog);
    const charCount = contentStr.length;
    lines.push(`  ${THIN_DIVIDER.slice(0, 70)}`);
    lines.push(`  [${i}] role=${msg.role}  (${charCount} chars)`);
    lines.push(indent(truncMessageBody(msg.role, contentStr, TRUNC_CHAT_REQUEST)));
  });
  lines.push(THIN_DIVIDER);
  lines.push("");

  write(lines, data.fileId);
}

/**
 * Log when a /api/chat stream finishes (token usage, timing, cost).
 */
export function logChatFinish(data: {
  fileId: string;
  requestId: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  costUsd?: number | null;
}): void {
  if (!IS_DEV) return;

  const costStr =
    data.costUsd != null ? `$${data.costUsd.toFixed(8)}` : "(unknown)";

  write(
    [
      `[${ts()}] [CHAT_FINISH] id=${data.requestId}`,
      field("Model", `${data.provider}/${data.model}`),
      field("Prompt Tkns", data.promptTokens),
      field("Compl. Tkns", data.completionTokens),
      field("Total Tkns", data.totalTokens),
      field("Cost USD", costStr),
      field("Duration ms", data.durationMs),
      "",
    ],
    data.fileId
  );
}

/**
 * Log a streaming error from the chat route.
 */
export function logChatError(data: {
  fileId: string;
  requestId: string;
  model: string;
  provider: string;
  error: unknown;
  phase: "stream" | "gateway" | "unknown";
}): void {
  if (!IS_DEV) return;

  // Use util.inspect to match console.error output exactly (handles Error subclasses,
  // custom properties like statusCode/responseBody, and nested objects)
  const errMsg = truncLog(inspect(data.error, { depth: null, breakLength: 80 }));

  write(
    [
      `[${ts()}] [CHAT_ERROR] id=${data.requestId}`,
      field("Phase", data.phase),
      field("Model", `${data.provider}/${data.model}`),
      "  Error:",
      indent(errMsg),
      "",
    ],
    data.fileId
  );
}

/**
 * Log LLM request constructed inside ModelGateway.processRequest.
 */
export function logLLMCall(data: {
  fileId: string;
  requestId: string;
  model: string;
  provider: string;
  agentMode: boolean;
  processedMessageCount: number;
  processedMessages: Array<{ role: string; content: unknown }>;
  hasTools: boolean;
  maxSteps?: number;
}): void {
  if (!IS_DEV) return;

  const lines: string[] = [
    `[${ts()}] [LLM_CALL] id=${data.requestId}`,
    field("Provider/Model", `${data.provider}/${data.model}`),
    field("Agent Mode", data.agentMode),
    field("Has Tools", data.hasTools),
    field("Max Steps", data.maxSteps ?? "(none)"),
    field("Msg Count", data.processedMessageCount),
    "  Processed Messages (after context injection):",
  ];

  data.processedMessages.forEach((msg, i) => {
    const msgWithOptionalParts = msg as { parts?: unknown };
    const sourceForLog = msg.content !== undefined ? msg.content : msgWithOptionalParts.parts;
    const contentStr = serializeForLog(sourceForLog);
    lines.push(`  ${THIN_DIVIDER.slice(0, 70)}`);
    lines.push(`  [${i}] role=${msg.role}  (${contentStr.length} chars)`);
    lines.push(indent(truncMessageBody(msg.role, contentStr, TRUNC_LLM_CALL)));
  });

  lines.push(THIN_DIVIDER);
  lines.push("");
  write(lines, data.fileId);
}

/**
 * Log what the context injection added/changed.
 */
export function logContextInject(data: {
  fileId: string;
  requestId: string;
  provider: string;
  model: string;
  supportsSystemMessages: boolean;
  hasAgentPrompt: boolean;
  agentPromptLength: number;
  finalSystemContentLength: number;
  injectionStrategy: "system_message" | "prepend_user" | "none";
}): void {
  if (!IS_DEV) return;

  write(
    [
      `[${ts()}] [CONTEXT_INJECT] id=${data.requestId}`,
      field("Provider/Model", `${data.provider}/${data.model}`),
      field("Sys Msg Supp.", data.supportsSystemMessages),
      field("Inject Strat.", data.injectionStrategy),
      field("Agent Prompt", data.hasAgentPrompt ? `yes (${data.agentPromptLength} chars)` : "no"),
      field("Final Sys", `${data.finalSystemContentLength} chars total`),
      "",
    ],
    data.fileId
  );
}


/**
 * Write a raw/forwarded entry from the browser (received by /api/dev-log).
 */
export function logClientEntry(data: {
  fileId: string;
  category: string;
  payload: unknown;
  browserTimestamp: string;
}): void {
  if (!IS_DEV) return;

  const payloadStr = truncLog(JSON.stringify(data.payload, null, 2), 3000);
  write(
    [
      `[${ts()}] [BROWSER→SERVER] category=${data.category}  browser_ts=${data.browserTimestamp}`,
      indent(payloadStr),
      "",
    ],
    data.fileId
  );
}

/**
 * Write a session start banner so it's easy to find where a dev run begins.
 */
export function logSessionStart(fileId: string): void {
  if (!IS_DEV) return;

  const logDir = "logs";
  const logFile = `${logDir}/${sanitizeFileId(fileId)}.log`;

  write(
    [
      "",
      DIVIDER,
      `  ORION DEV SESSION STARTED  ${ts()}`,
      `  Log file: ${logFile}`,
      DIVIDER,
      "",
    ],
    fileId
  );
}
