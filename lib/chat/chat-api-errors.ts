import { APICallError } from "@ai-sdk/provider";
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
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
};

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
 * Builds a structured chat API error payload for both pre-stream failures and
 * streamed `onError` handlers.
 */
export function buildChatApiErrorPayload(
  error: unknown,
  providerId: string
): ChatApiErrorPayload {
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

  if (error instanceof Error) {
    return {
      title: "API Error",
      message: error.message || "An unexpected error occurred.",
    };
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
