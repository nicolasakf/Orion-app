import { APICallError } from "@ai-sdk/provider";
import { InvalidToolInputError, NoSuchToolError } from "ai";
import { z } from "zod";

/** ChatGPT account page where users can upgrade or manage subscription limits. */
export const CHATGPT_ACCOUNT_URL = "https://chatgpt.com";

/** OpenAI platform billing page for API-key based accounts. */
export const OPENAI_BILLING_URL = "https://platform.openai.com/account/billing";

const OpenAiUsageLimitErrorSchema = z.object({
  error: z
    .object({
      type: z.string().optional(),
      message: z.string().optional(),
      resets_in_seconds: z.number().optional(),
      plan_type: z.string().optional(),
    })
    .optional(),
});

export type ChatApiErrorPayload = {
  code?: "context_budget_exceeded" | "invalid_tool_input";
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
};

const ProviderErrorRecordSchema = z
  .object({
    code: z.union([z.string(), z.number()]).nullish(),
    type: z.string().nullish(),
    status: z.union([z.string(), z.number()]).nullish(),
    statusCode: z.number().nullish(),
    message: z.string().nullish(),
    error: z.unknown().optional(),
    cause: z.unknown().optional(),
    data: z.unknown().optional(),
    responseBody: z.string().optional(),
  })
  .passthrough();

interface ProviderErrorFact {
  code?: string;
  type?: string;
  status?: string;
  message?: string;
}

export interface ContextLimitErrorMatch {
  matchedRule: string;
  fact: ProviderErrorFact;
}

export interface ProviderErrorDiagnostic {
  code?: string;
  type?: string;
  status?: string;
  matchedRule?: string;
}

const MAX_ERROR_TRAVERSAL_DEPTH = 6;
const MAX_ERROR_TRAVERSAL_NODES = 48;
const CONTEXT_LIMIT_CODES = new Set([
  "context_length_exceeded",
  "context_window_exceeded",
  "input_too_long",
  "prompt_too_long",
]);
const EXPLICIT_CONTEXT_LIMIT_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "prompt-too-long", pattern: /\bprompt is too long\b/iu },
  {
    id: "context-length-exceeded",
    pattern: /\bcontext(?:[ _-]?)(?:length|window)(?: is)? exceeded\b/iu,
  },
  {
    id: "input-exceeds-context-window",
    pattern: /\binput exceeds (?:the )?context window\b/iu,
  },
  {
    id: "input-token-count-exceeds-maximum",
    pattern:
      /\binput token count\b[\s\S]*\bexceeds\b[\s\S]*\bmaximum(?: number of)? tokens?\b/iu,
  },
  {
    id: "input-exceeds-token-limit",
    pattern:
      /\binput(?: length| tokens?)?\b[\s\S]*\bexceeds\b[\s\S]*\b(?:context window|input token limit|maximum number of tokens allowed)\b/iu,
  },
  {
    id: "maximum-context-requested",
    pattern:
      /\bmaximum context (?:length|window)\b[\s\S]*\b(?:exceeded|requested|supports? up to)\b/iu,
  },
  { id: "request-too-large-for-model", pattern: /\brequest too large for (?:the )?model\b/iu },
  {
    id: "too-many-input-tokens",
    pattern: /\btoo many tokens in (?:the )?(?:prompt|context|input)\b/iu,
  },
];

/** Parses a possible JSON string without treating plain provider messages as JSON. */
function parsePossibleJson(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** Collects normalized provider error facts from SDK errors and raw SSE envelopes. */
function collectProviderErrorFacts(error: unknown): ProviderErrorFact[] {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }];
  const seen = new Set<unknown>();
  const facts: ProviderErrorFact[] = [];

  if (APICallError.isInstance(error)) {
    queue.push({ value: error.data, depth: 1 });
    if (error.responseBody) queue.push({ value: error.responseBody, depth: 1 });
  }

  while (queue.length > 0 && seen.size < MAX_ERROR_TRAVERSAL_NODES) {
    const current = queue.shift();
    if (!current || current.depth > MAX_ERROR_TRAVERSAL_DEPTH) continue;
    const { value, depth } = current;
    if (value == null || seen.has(value)) continue;
    seen.add(value);

    if (typeof value === "string") {
      const parsedJson = parsePossibleJson(value);
      if (parsedJson !== undefined) queue.push({ value: parsedJson, depth: depth + 1 });
      else if (value.trim()) facts.push({ message: value.trim() });
      continue;
    }

    const parsed = ProviderErrorRecordSchema.safeParse(value);
    if (!parsed.success) continue;
    const record = parsed.data;
    const status = record.statusCode ?? record.status;
    const fact: ProviderErrorFact = {
      code: record.code == null ? undefined : String(record.code).toLowerCase(),
      type: record.type?.toLowerCase(),
      status: status == null ? undefined : String(status).toUpperCase(),
      message: record.message?.trim(),
    };
    if (fact.code || fact.type || fact.status || fact.message) facts.push(fact);

    for (const nested of [record.error, record.cause, record.data, record.responseBody]) {
      if (nested !== undefined) queue.push({ value: nested, depth: depth + 1 });
    }
  }

  return facts;
}

/** Resolves the native provider family for gateway and OAuth model selections. */
function resolveProviderFamily(providerId: string, modelId?: string): string {
  if (providerId === "chatgpt-oauth") return "openai";
  if (providerId === "vercel" && modelId?.includes("/")) {
    return modelId.slice(0, modelId.indexOf("/")).toLowerCase();
  }
  return providerId.toLowerCase();
}

/** Detects provider context-limit failures at the server boundary. */
export function classifyContextLimitError(
  error: unknown,
  providerId: string,
  modelId?: string
): ContextLimitErrorMatch | null {
  const providerFamily = resolveProviderFamily(providerId, modelId);
  const facts = collectProviderErrorFacts(error);

  for (const fact of facts) {
    if (fact.code && CONTEXT_LIMIT_CODES.has(fact.code)) {
      return { matchedRule: `${providerFamily}:code:${fact.code}`, fact };
    }
    if (fact.type && CONTEXT_LIMIT_CODES.has(fact.type)) {
      return { matchedRule: `${providerFamily}:type:${fact.type}`, fact };
    }
  }

  for (const fact of facts) {
    if (!fact.message) continue;
    const matchedPattern = EXPLICIT_CONTEXT_LIMIT_PATTERNS.find(({ pattern }) =>
      pattern.test(fact.message ?? "")
    );
    if (!matchedPattern) continue;

    const isInvalidRequest =
      fact.type === "invalid_request_error" || fact.code === "invalid_request";
    const matchesProviderEnvelope =
      ((providerFamily === "anthropic" || providerFamily === "groq") &&
        fact.type === "invalid_request_error") ||
      (providerFamily === "google" &&
        (isInvalidRequest ||
          fact.status === "INVALID_ARGUMENT" ||
          fact.status === "400")) ||
      (["cerebras", "ollama", "lmstudio", "mlx", "custom"].includes(
        providerFamily
      ) &&
        (isInvalidRequest || fact.status === "400" || fact.type === undefined));

    if (matchesProviderEnvelope) {
      return {
        matchedRule: `${providerFamily}:message:${matchedPattern.id}`,
        fact,
      };
    }
  }

  return null;
}

/** Returns safe structured fields for error logs without serializing prompts or response bodies. */
export function getProviderErrorDiagnostic(
  error: unknown,
  providerId: string,
  modelId?: string
): ProviderErrorDiagnostic {
  const match = classifyContextLimitError(error, providerId, modelId);
  const fact = match?.fact ?? collectProviderErrorFacts(error)[0] ?? {};
  return {
    code: fact.code,
    type: fact.type,
    status: fact.status,
    matchedRule: match?.matchedRule,
  };
}

/** Parses OpenAI / ChatGPT usage-limit metadata from an API error payload. */
function readUsageLimitError(error: unknown): z.infer<typeof OpenAiUsageLimitErrorSchema>["error"] | null {
  if (APICallError.isInstance(error)) {
    if (error.data != null) {
      const parsed = OpenAiUsageLimitErrorSchema.safeParse(error.data);
      if (parsed.success && parsed.data.error?.type === "usage_limit_reached") {
        return parsed.data.error;
      }
    }

    if (typeof error.responseBody === "string" && error.responseBody.trim() !== "") {
      try {
        const parsed = OpenAiUsageLimitErrorSchema.safeParse(JSON.parse(error.responseBody));
        if (parsed.success && parsed.data.error?.type === "usage_limit_reached") {
          return parsed.data.error;
        }
      } catch {
        // Ignore malformed response bodies.
      }
    }
  }

  return null;
}

/** Returns a human-readable reset hint when the provider includes a countdown. */
function formatUsageLimitResetHint(resetsInSeconds: number | undefined): string {
  if (resetsInSeconds == null || !Number.isFinite(resetsInSeconds) || resetsInSeconds <= 0) {
    return "";
  }

  if (resetsInSeconds < 60) {
    return ` Your limit should reset in about ${Math.max(1, Math.round(resetsInSeconds))} seconds.`;
  }

  const minutes = Math.max(1, Math.round(resetsInSeconds / 60));
  if (minutes < 120) {
    return ` Your limit should reset in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  const hours = Math.max(1, Math.round(minutes / 60));
  return ` Your limit should reset in about ${hours} hour${hours === 1 ? "" : "s"}.`;
}

/** Chooses the best account-management URL for the active provider. */
function resolveUsageLimitActionUrl(providerId: string, error: unknown): string {
  if (providerId === "chatgpt-oauth") {
    return CHATGPT_ACCOUNT_URL;
  }

  if (APICallError.isInstance(error) && error.url.includes("chatgpt.com")) {
    return CHATGPT_ACCOUNT_URL;
  }

  if (providerId === "openai") {
    return OPENAI_BILLING_URL;
  }

  return CHATGPT_ACCOUNT_URL;
}

/** Reads an HTTP status code from AI SDK provider errors. */
function readApiErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  if (APICallError.isInstance(error)) {
    return error.statusCode;
  }

  const candidate = error as { status?: number; statusCode?: number };
  return candidate.statusCode ?? candidate.status;
}

/**
 * Describes a tool call the SDK rejected before it ever reached the browser.
 *
 * `isInstance` matches on the SDK's symbol marker rather than the prototype
 * chain, which survives the bundle boundaries that make `instanceof Error`
 * unreliable inside the Next.js server runtime.
 */
function readToolCallError(error: unknown): { title: string; message: string } | null {
  if (NoSuchToolError.isInstance(error)) {
    return {
      title: "Unknown Tool",
      message:
        `No tool named "${error.toolName}" is available in this mode. ` +
        "Use one of the tools listed for the current mode instead.",
    };
  }

  if (InvalidToolInputError.isInstance(error)) {
    const detail =
      error.cause instanceof Error && error.cause.message
        ? error.cause.message
        : error.message;
    return {
      title: "Invalid Tool Input",
      message:
        `The arguments for "${error.toolName}" did not match its schema: ${detail}. ` +
        "Re-issue the call with that argument corrected — the tool itself is working.",
    };
  }

  return null;
}

/** Best-effort message text from an error that may not survive `instanceof`. */
function readErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message || undefined;
  if (typeof error === "string") return error || undefined;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return undefined;
}

/**
 * Builds a structured chat API error payload for both pre-stream failures and
 * streamed `onError` handlers.
 */
export function buildChatApiErrorPayload(
  error: unknown,
  providerId: string,
  modelId?: string
): ChatApiErrorPayload {
  if (classifyContextLimitError(error, providerId, modelId)) {
    return {
      code: "context_budget_exceeded",
      title: "Context Budget Exceeded",
      message: "The prepared request exceeded the selected model's context budget.",
    };
  }

  // Checked before the provider/status branches: a rejected tool call is Orion's
  // own schema talking, not the provider, and the model can only recover from it
  // if the reply names the offending argument.
  const toolCallError = readToolCallError(error);
  if (toolCallError) {
    return { code: "invalid_tool_input", ...toolCallError };
  }

  const usageLimitError = readUsageLimitError(error);
  if (usageLimitError) {
    const resetHint = formatUsageLimitResetHint(usageLimitError.resets_in_seconds);
    const providerMessage =
      typeof usageLimitError.message === "string" && usageLimitError.message.trim() !== ""
        ? usageLimitError.message.trim()
        : "The usage limit has been reached.";

    return {
      title: "Usage Limit Reached",
      message: `${providerMessage}${resetHint} Open your ChatGPT account to upgrade your plan or review usage limits.`,
      actionUrl: resolveUsageLimitActionUrl(providerId, error),
      actionLabel: "Open ChatGPT account",
    };
  }

  const statusCode = readApiErrorStatusCode(error);

  if (statusCode === 401) {
    return {
      title: "Authentication Error",
      message: `The ${providerId} credential is invalid or expired. Update it in Settings -> Providers.`,
    };
  }

  if (statusCode === 429) {
    return {
      title: "Rate Limit Exceeded",
      message: `The ${providerId} provider rate limit was exceeded.`,
    };
  }

  // Not `instanceof Error`: server-runtime bundling and stream serialization
  // both produce error-shaped objects that fail the prototype check, and
  // discarding their message is what turned a one-line schema complaint into
  // "check the server logs" in session 1786897277027.
  const message = readErrorMessage(error);
  if (message) {
    return { title: "API Error", message };
  }

  return {
    title: "API Error",
    message: "An unexpected error occurred. Please check the server logs for more details.",
  };
}

/** Serializes a chat API error payload for `useChat` error messages. */
export function serializeChatApiErrorPayload(payload: ChatApiErrorPayload): string {
  return JSON.stringify(payload);
}

/** Parses a chat API error payload from a `useChat` error message when present. */
export function parseChatApiErrorMessage(message: string | undefined): ChatApiErrorPayload | null {
  if (!message) return null;

  try {
    const parsed = JSON.parse(message) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "title" in parsed &&
      "message" in parsed &&
      typeof parsed.title === "string" &&
      typeof parsed.message === "string"
    ) {
      const payload = parsed as ChatApiErrorPayload;
      return {
        code: payload.code === "context_budget_exceeded" ? payload.code : undefined,
        title: payload.title,
        message: payload.message,
        actionUrl: typeof payload.actionUrl === "string" ? payload.actionUrl : undefined,
        actionLabel: typeof payload.actionLabel === "string" ? payload.actionLabel : undefined,
      };
    }
  } catch {
    // Not a structured chat API error payload.
  }

  return null;
}
