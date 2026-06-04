import type { ModelMessage } from "@ai-sdk/provider-utils";
import type { LanguageModelUsage, ProviderMetadata } from "ai";

import { extractTokenBreakdown, type TokenBreakdown } from "@/lib/agent/cost-calculator";

/** Normalize user-entered OpenAI-compatible base URLs. */
export function normalizeOpenAICompatibleBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim();
  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (parsed.pathname === "" || parsed.pathname === "/") {
    parsed.pathname = "/v1";
  } else {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString().replace(/\/$/, "");
}

/** Returns a zero-cost generic usage breakdown for providers without quirks. */
export function normalizeGenericUsage(input: {
  usage: LanguageModelUsage;
  providerMetadata: ProviderMetadata | undefined;
  providerId: string;
}): TokenBreakdown {
  return extractTokenBreakdown(input.usage, input.providerMetadata, input.providerId);
}

/** Inject an Orion system prompt while preserving existing system content. */
export function injectSystemPrompt(
  messages: ModelMessage[],
  agentSystemPrompt?: string,
  supportsSystemMessages = true
): ModelMessage[] {
  if (!agentSystemPrompt) return messages;

  if (!supportsSystemMessages) {
    const result: ModelMessage[] = [];
    let injected = false;

    for (const msg of messages) {
      if (msg.role === "system") continue;
      if (msg.role === "user" && !injected) {
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        result.push({
          role: "user",
          content: `${agentSystemPrompt}\n\n---\n\n${content}`,
        });
        injected = true;
        continue;
      }
      result.push(msg);
    }

    if (!injected) result.unshift({ role: "user", content: agentSystemPrompt });
    return result;
  }

  const result: ModelMessage[] = [];
  let found = false;

  for (const msg of messages) {
    if (msg.role !== "system") {
      result.push(msg);
      continue;
    }
    result.push({
      role: "system",
      content: `${agentSystemPrompt}\n\n${typeof msg.content === "string" ? msg.content : ""}`,
    });
    found = true;
  }

  if (!found) result.unshift({ role: "system", content: agentSystemPrompt });
  return result;
}

/** Extract a text body from a fetch request body when patching provider payloads. */
export function requestBodyText(body: BodyInit | null | undefined): string | null {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return null;
}
