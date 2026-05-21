import "server-only";

/**
 * ModelGateway - Multi-provider LLM abstraction layer
 *
 * This module:
 * - Normalizes provider selection and model instantiation
 * - Handles provider-specific configurations
 * - Provides a clean interface for adding new providers (e.g., xAI)
 * - Manages context injection and system prompt formatting
 *
 * ## Anthropic prompt caching
 *
 * We enable Anthropic prompt caching to reduce input token costs and rate-limit pressure
 * on multi-turn agent conversations. Caching requires:
 * 1. The `anthropic-beta: prompt-caching-2024-07-31` header
 * 2. `cache_control: { type: "ephemeral" }` on content blocks in the request body
 *
 * The @ai-sdk/anthropic SDK does not serialize message-level cache hints into the
 * outbound API request. We work around this by wrapping the fetch in a custom fetch
 * that injects the beta header and patches the request body with cache_control on
 * the system block and the second-to-last user message (multi-turn boundary).
 * See `createAnthropicModel` and `addAnthropicCacheBreakpoints` for details.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { ModelMessage } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";

import type { CredentialMode, SupportedProvider } from "./model-gateway-types";

export type { CredentialMode, SupportedProvider } from "./model-gateway-types";

/** The ChatGPT backend endpoint used for OAuth / subscription-based access. */
const CHATGPT_CODEX_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

/** Normalize user-entered OpenAI-compatible base URLs for local runtimes. */
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

// ============================================================================
// Types
// ============================================================================

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  options?: Record<string, any>;
}

export interface ModelInfo {
  id: string;
  provider: SupportedProvider;
  displayName: string;
  contextWindow: number;
  supportsStreaming: boolean;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
}

export interface GatewayRequest {
  messages: ModelMessage[];
  modelId: string;
  providerId: SupportedProvider;
  /** Optional agent system prompt to inject (used in agent mode) */
  agentSystemPrompt?: string;
  /** Optional request ID for correlating dev logs */
  requestId?: string;
  /** Provider-specific per-model settings from the client UI */
  modelSettings?: Record<string, unknown>;
  /** Request-scoped user credential supplied by the local client. */
  credentials?: CredentialMode;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
  };
}

export interface GatewayResponse {
  model: LanguageModel;
  messages: ModelMessage[];
  providerOptions: Record<string, any>;
}

export interface GatewayError {
  code: string;
  message: string;
  provider: string;
  status: number;
}

// ============================================================================
// Provider Registry
// ============================================================================

const PROVIDER_INFO: Record<SupportedProvider, { name: string }> = {
  openai: { name: "OpenAI" },
  anthropic: { name: "Anthropic" },
  google: { name: "Google" },
  xai: { name: "xAI" },
  ollama: { name: "Ollama" },
  lmstudio: { name: "LM Studio" },
};

// Default model configurations
const MODEL_DEFAULTS: Record<string, Partial<ModelInfo>> = {
  // Local providers
  "ollama-local": { contextWindow: 32768, supportsStreaming: true },
  "lmstudio-local": { contextWindow: 32768, supportsStreaming: true },

  // xAI
  "grok-4.20-0309-reasoning": { contextWindow: 2000000, supportsStreaming: true },
  "grok-4.20-0309-non-reasoning": { contextWindow: 2000000, supportsStreaming: true },
  "grok-4.20-multi-agent-0309": { contextWindow: 2000000, supportsStreaming: true },
  "grok-4-1-fast-reasoning": { contextWindow: 2000000, supportsStreaming: true },
  "grok-4-1-fast-non-reasoning": { contextWindow: 2000000, supportsStreaming: true },
  "grok-code-fast-1": { contextWindow: 256000, supportsStreaming: true },
  "grok-4-fast-reasoning": { contextWindow: 2000000, supportsStreaming: true },
  "grok-4": { contextWindow: 256000, supportsStreaming: true },
  "grok-3": { contextWindow: 131072, supportsStreaming: true },
  "grok-3-mini": { contextWindow: 131072, supportsStreaming: true },

  // Google
  "gemini-3.1-pro-preview": { contextWindow: 1048576, supportsStreaming: true },
  "gemini-3.1-flash-lite": { contextWindow: 1048576, supportsStreaming: true },
  "gemini-3-flash-preview": { contextWindow: 1048576, supportsStreaming: true },
  "gemini-3.5-flash": { contextWindow: 1048576, supportsStreaming: true },
  "gemini-2.5-pro": { contextWindow: 1048576, supportsStreaming: true },
  "gemini-2.5-flash": { contextWindow: 1048576, supportsStreaming: true },
  "gemini-2.5-flash-lite": { contextWindow: 1048576, supportsStreaming: true },
  "gemma-4-31b-it": { contextWindow: 262144, supportsStreaming: true },
  "gemma-4-26b-a4b-it": { contextWindow: 262144, supportsStreaming: true },

  // Anthropic
  "claude-opus-4-7": { contextWindow: 1000000, supportsStreaming: true },
  "claude-opus-4-6": { contextWindow: 1000000, supportsStreaming: true },
  "claude-sonnet-4-6": { contextWindow: 1000000, supportsStreaming: true },
  "claude-opus-4-5-20251101": { contextWindow: 200000, supportsStreaming: true },
  "claude-sonnet-4-5": { contextWindow: 1000000, supportsStreaming: true },
  "claude-haiku-4-5": { contextWindow: 200000, supportsStreaming: true },
  "claude-opus-4-1": { contextWindow: 200000, supportsStreaming: true },
  "claude-sonnet-4": { contextWindow: 1000000, supportsStreaming: true },

  // OpenAI
  "gpt-5.5": { contextWindow: 1050000, supportsStreaming: true },
  "gpt-5.4": { contextWindow: 1050000, supportsStreaming: true },
  "gpt-5.4-pro": { contextWindow: 1050000, supportsStreaming: true },
  "gpt-5.4-mini": { contextWindow: 400000, supportsStreaming: true },
  "gpt-5.4-nano": { contextWindow: 400000, supportsStreaming: true },
  "gpt-5.3": { contextWindow: 400000, supportsStreaming: true },
  "gpt-5.3-codex": { contextWindow: 400000, supportsStreaming: true },
  "gpt-5.3-pro": { contextWindow: 400000, supportsStreaming: true },
  "gpt-5.3-mini": { contextWindow: 128000, supportsStreaming: true },
  "gpt-5.3-nano": { contextWindow: 128000, supportsStreaming: true },
  "gpt-5.2": { contextWindow: 400000, supportsStreaming: true },
  "gpt-5.2-pro": { contextWindow: 400000, supportsStreaming: true },
  "gpt-5-mini": { contextWindow: 128000, supportsStreaming: true },
  "gpt-5-nano": { contextWindow: 128000, supportsStreaming: true },
  "gpt-4o": { contextWindow: 128000, supportsStreaming: true },
  "gpt-4o-mini": { contextWindow: 128000, supportsStreaming: true },
  "gpt-4-turbo": { contextWindow: 128000, supportsStreaming: true },
  "gpt-3.5-turbo": { contextWindow: 16385, supportsStreaming: true },
  "o3": { contextWindow: 200000, supportsStreaming: true },
  "o3-pro": { contextWindow: 200000, supportsStreaming: true },
  "o3-mini": { contextWindow: 200000, supportsStreaming: true },
};

// ============================================================================
// ModelGateway Class
// ============================================================================

export class ModelGateway {
  /** Create a model instance for the given provider and model ID. */
  createModel(
    providerId: SupportedProvider,
    modelId: string,
    config: ProviderConfig
  ): LanguageModel {
    if (!config?.apiKey && providerId !== "ollama" && providerId !== "lmstudio") {
      throw new GatewayConfigError(
        `${PROVIDER_INFO[providerId]?.name || providerId} API key not configured`,
        providerId
      );
    }

    switch (providerId) {
      case "openai":
        return this.createOpenAIModel(config, modelId);

      case "anthropic":
        return this.createAnthropicModel(config, modelId);

      case "google":
        return this.createGoogleModel(config, modelId);

      case "xai":
        return this.createXAIModel(config, modelId);

      case "ollama":
      case "lmstudio":
        return this.createLocalOpenAICompatibleModel(config, modelId);

      default:
        throw new GatewayConfigError(
          `Unsupported provider: ${providerId}`,
          providerId
        );
    }
  }

  /**
   * Create an OpenAI-compatible model instance that uses a ChatGPT OAuth
   * access token instead of an API key.
   *
   * The custom fetch wrapper:
   * 1. Removes the dummy Authorization header added by the SDK
   * 2. Injects `Authorization: Bearer <accessToken>`
   * 3. Injects `ChatGPT-Account-Id` (required for organisation subscriptions)
   * 4. Rewrites the URL to the ChatGPT backend endpoint
   */
  /**
   * Create an OpenAI-compatible model instance that uses a ChatGPT OAuth
   * access token instead of an API key.
   *
   * Uses `openai.responses()` (the Responses API provider) because
   * `chatgpt.com/backend-api/codex/responses` speaks the Responses API format
   * (`instructions` + `input`), not Chat Completions (`messages`). The custom
   * fetch wrapper rewrites the URL and injects the OAuth bearer token.
   */
  private createChatGPTOAuthModel(
    accessToken: string,
    accountId: string | undefined,
    modelId: string
  ): LanguageModel {
    const openai = createOpenAI({
      // Dummy key so the SDK does not throw "missing apiKey".
      // The fetch wrapper below replaces it with the real OAuth token.
      apiKey: "chatgpt-oauth-dummy",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);

        // Replace the dummy key with the real OAuth bearer token.
        headers.set("Authorization", `Bearer ${accessToken}`);
        headers.delete("api-key");

        // Required by the ChatGPT backend for organisation/subscription routing.
        if (accountId) {
          headers.set("ChatGPT-Account-Id", accountId);
        }

        // Tag requests so OpenAI can attribute them.
        headers.set("originator", "orion");

        // The AI SDK sends system/developer instructions inside the `input` array,
        // but the ChatGPT Codex endpoint requires them as a top-level
        // `instructions` string. Extract those instruction-like items and promote
        // them before sending the upstream request.
        type ResponsesBody = {
          input?: Array<{ role: string; content: unknown }>;
          instructions?: string;
          store?: boolean;
          [key: string]: unknown;
        };

        const rawBody =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof Uint8Array
              ? new TextDecoder().decode(init.body)
              : null;

        let patchedBody = rawBody;
        if (rawBody) {
          try {
            const parsed = JSON.parse(rawBody) as ResponsesBody;

            let mutated = false;
            if (Array.isArray(parsed.input) && !parsed.instructions) {
              const instructionItems = parsed.input.filter(
                (m) => m.role === "system" || m.role === "developer"
              );
              const nonInstructionItems = parsed.input.filter(
                (m) => m.role !== "system" && m.role !== "developer"
              );
              if (instructionItems.length > 0) {
                parsed.instructions = instructionItems
                  .map((m) =>
                    typeof m.content === "string" ? m.content : JSON.stringify(m.content)
                  )
                  .join("\n\n");
                parsed.input = nonInstructionItems;
                mutated = true;
              }
            }

            if (parsed.store !== false) {
              parsed.store = false;
              mutated = true;
            }

            if (mutated) {
              patchedBody = JSON.stringify(parsed);
            }
          } catch {
            // Keep original body if parsing fails.
          }
        }

        // Rewrite the Responses API URL to the ChatGPT backend endpoint.
        const url = new URL(CHATGPT_CODEX_ENDPOINT);

        return fetch(url, { ...init, headers, body: patchedBody ?? init?.body });
      },
    });
    // Use the Responses API provider — it sends `instructions` + `input`
    // and parses the Responses API streaming event format.
    return openai.responses(modelId);
  }

  private createOpenAIModel(config: ProviderConfig, modelId: string): LanguageModel {
    const openai = createOpenAI({
      apiKey: config.apiKey,
      ...config.options,
    });
    return openai.chat(modelId);
  }

  /**
   * Create an Anthropic model with prompt caching enabled.
   *
   * The @ai-sdk/anthropic SDK does not send cache_control or the anthropic-beta header
   * to the API, even when message-level providerOptions are set. We wrap the fetch to:
   *
   * 1. Add `anthropic-beta: prompt-caching-2024-07-31` — required to opt into caching
   * 2. Patch the request body to add `cache_control: { type: "ephemeral" }` on:
   *    - The system content block (stable across turns, biggest cache win)
   *    - The second-to-last user message content block (multi-turn cache boundary)
   *
   * Without this transport-level patching, Anthropic would never receive cache hints
   * and cacheCreationInputTokens / cacheReadInputTokens would remain 0.
   */
  private createAnthropicModel(config: ProviderConfig, modelId: string): LanguageModel {
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const promptCachingBeta = "prompt-caching-2024-07-31";
        const existingBetaHeader = headers.get("anthropic-beta");
        if (!existingBetaHeader) {
          headers.set("anthropic-beta", promptCachingBeta);
        } else if (!existingBetaHeader.includes(promptCachingBeta)) {
          headers.set("anthropic-beta", `${existingBetaHeader},${promptCachingBeta}`);
        }

        const bodyText =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof Uint8Array
              ? new TextDecoder().decode(init.body)
              : null;

        type AnthropicCacheControl = { type: "ephemeral" };
        type AnthropicTextBlock = {
          type?: string;
          text?: string;
          cache_control?: AnthropicCacheControl;
          [key: string]: unknown;
        };
        type AnthropicMessage = {
          role?: string;
          content?: string | AnthropicTextBlock[];
          [key: string]: unknown;
        };
        type AnthropicRequestBody = {
          system?: string | AnthropicTextBlock[];
          messages?: AnthropicMessage[];
          [key: string]: unknown;
        };

        const breakpoint: AnthropicCacheControl = { type: "ephemeral" };
        const ensureContentHasCacheControl = (content: unknown): unknown => {
          if (typeof content === "string") {
            return [
              {
                type: "text",
                text: content,
                cache_control: breakpoint,
              },
            ];
          }
          if (Array.isArray(content)) {
            const blocks = [...content] as AnthropicTextBlock[];
            const targetIdx = blocks.findIndex((block) => {
              if (typeof block !== "object" || block === null) return false;
              const blockType = typeof block.type === "string" ? block.type : "text";
              return blockType === "text";
            });
            if (targetIdx !== -1) {
              const current = blocks[targetIdx];
              if (
                typeof current === "object" &&
                current !== null &&
                !("cache_control" in current)
              ) {
                blocks[targetIdx] = { ...current, cache_control: breakpoint };
                return blocks;
              }
            }
            return content;
          }
          return content;
        };

        let patchedBodyText = bodyText;
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText) as AnthropicRequestBody;

            if (parsed.system !== undefined) {
              parsed.system = ensureContentHasCacheControl(parsed.system) as AnthropicRequestBody["system"];
            }

            if (Array.isArray(parsed.messages)) {
              const userMessageIndices = parsed.messages
                .map((message, index) => (message.role === "user" ? index : -1))
                .filter((index) => index !== -1);
              if (userMessageIndices.length >= 2) {
                const secondLastUserIdx = userMessageIndices[userMessageIndices.length - 2];
                const secondLastUserMessage = parsed.messages[secondLastUserIdx];
                parsed.messages[secondLastUserIdx] = {
                  ...secondLastUserMessage,
                  content: ensureContentHasCacheControl(
                    secondLastUserMessage.content
                  ) as AnthropicMessage["content"],
                };
              }
            }

            patchedBodyText = JSON.stringify(parsed);
          } catch {
            // Keep original body if parsing fails for any reason.
          }
        }

        return fetch(input, {
          ...init,
          headers,
          body: patchedBodyText ?? init?.body,
        });
      },
      ...config.options,
    });
    return anthropic(modelId);
  }

  private createGoogleModel(config: ProviderConfig, modelId: string): LanguageModel {
    const google = createGoogleGenerativeAI({
      apiKey: config.apiKey,
      ...config.options,
    });
    return google(modelId);
  }

  private createXAIModel(config: ProviderConfig, modelId: string): LanguageModel {
    // xAI uses OpenAI-compatible API via Chat Completions endpoint.
    const xai = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || "https://api.x.ai/v1",
      ...config.options,
    });
    return xai.chat(modelId);
  }

  /** Create a chat model for local OpenAI-compatible runtimes. */
  private createLocalOpenAICompatibleModel(
    config: ProviderConfig,
    modelId: string
  ): LanguageModel {
    if (!config.baseUrl) {
      throw new GatewayConfigError("Local provider base URL not configured", "local");
    }

    const localProvider = createOpenAI({
      apiKey: config.apiKey || "local-endpoint",
      baseURL: normalizeOpenAICompatibleBaseUrl(config.baseUrl),
      ...config.options,
    });
    return localProvider.chat(modelId);
  }

  /**
   * Get provider-specific streaming options, merging any per-model settings
   * from the client UI.
   */
  getProviderOptions(
    providerId: SupportedProvider,
    modelSettings?: Record<string, unknown>
  ): Record<string, any> {
    switch (providerId) {
      case "openai": {
        const opts: Record<string, any> = {
          openai: {
            stream_options: { include_usage: true },
          },
        };

        if (modelSettings?.reasoningEffort) {
          opts.openai.reasoningEffort = modelSettings.reasoningEffort;
        }

        return opts;
      }

      case "anthropic": {
        const extendedThinking = modelSettings?.extendedThinking ?? true;
        const budgetTokens =
          typeof modelSettings?.thinkingBudgetTokens === "number"
            ? modelSettings.thinkingBudgetTokens
            : 10000;

        return {
          anthropic: {
            thinking: extendedThinking
              ? { type: "enabled", budgetTokens }
              : { type: "disabled" },
          },
        };
      }

      case "xai":
        return {
          openai: {
            stream_options: { include_usage: true },
          },
        };

      case "ollama":
      case "lmstudio":
        return {};

      default:
        return {};
    }
  }

  /**
   * Process a gateway request and return model + processed messages.
   *
   * When `request.credentials` is `byok`, the user's own API key is used.
   * When `chatgpt_oauth`, the ChatGPT backend endpoint is used with the OAuth token.
   */
  processRequest(request: GatewayRequest): GatewayResponse {
    const { messages, modelId, providerId, agentSystemPrompt, modelSettings, credentials } = request;

    // Create the model — dispatch based on credential mode.
    let model: LanguageModel;
    const cred = credentials;

    if (!cred) {
      throw new GatewayConfigError(
        `${PROVIDER_INFO[providerId]?.name || providerId} credential not provided`,
        providerId
      );
    }

    if (cred.type === "chatgpt_oauth") {
      model = this.createChatGPTOAuthModel(cred.accessToken, cred.accountId, modelId);
    } else if (cred.type === "local_endpoint") {
      model = this.createModel(providerId, cred.modelId, {
        apiKey: cred.apiKey || "local-endpoint",
        baseUrl: cred.baseUrl,
      });
    } else {
      model = this.createModel(providerId, modelId, { apiKey: cred.apiKey });
    }

    // Inject agent system prompt
    let processedMessages = this.injectContext(
      messages,
      providerId,
      modelId,
      agentSystemPrompt
    );

    // ChatGPT OAuth requests must replay literal conversation content because
    // the backend requires `store: false`, which makes OpenAI item references
    // from prior turns invalid on follow-up requests.
    if (cred.type === "chatgpt_oauth") {
      processedMessages = this.stripMessageProviderOptions(processedMessages);
    }

    // Add Anthropic cache control breakpoints for prompt caching
    if (providerId === "anthropic") {
      processedMessages = this.addAnthropicCacheBreakpoints(processedMessages);
    }

    // Get provider-specific options (merged with per-model client settings)
    const providerOptions = this.getProviderOptions(providerId, modelSettings);

    return {
      model,
      messages: processedMessages,
      providerOptions,
    };
  }

  /**
   * Remove AI SDK message/part provider metadata before replaying history.
   *
   * ChatGPT OAuth requests cannot reuse OpenAI item references because the
   * upstream request must set `store: false`. Stripping item metadata forces
   * the SDK to serialize prior turns as literal content instead of opaque IDs.
   * Reasoning parts are the exception: encrypted content can be replayed safely,
   * while bare reasoning summaries must be omitted to avoid OpenAI Responses
   * warnings about unsupported non-OpenAI reasoning parts.
   */
  private stripMessageProviderOptions(messages: ModelMessage[]): ModelMessage[] {
    /** Extract the OpenAI metadata bag from AI SDK provider metadata fields. */
    const readOpenAIOptions = (metadata: unknown): Record<string, unknown> | undefined => {
      if (typeof metadata !== "object" || metadata === null) return undefined;
      const openai = (metadata as Record<string, unknown>).openai;
      return typeof openai === "object" && openai !== null
        ? openai as Record<string, unknown>
        : undefined;
    };

    return messages.flatMap((message): ModelMessage[] => {
      const messageRecord = message as ModelMessage & {
        providerOptions?: Record<string, unknown>;
        providerMetadata?: Record<string, unknown>;
      };
      const {
        providerOptions: _messageProviderOptions,
        providerMetadata: _messageProviderMetadata,
        ...messageWithoutProviderOptions
      } = messageRecord;

      if (!Array.isArray(message.content)) {
        return [messageWithoutProviderOptions as ModelMessage];
      }

      const strippedContent = message.content.flatMap((part): unknown[] => {
        if (typeof part !== "object" || part === null) {
          return [part];
        }

        const partRecord = part as unknown as Record<string, unknown>;
        const {
          providerOptions: _partProviderOptions,
          providerMetadata: _partProviderMetadata,
          ...partWithoutProviderOptions
        } = partRecord;

        if (partRecord.type !== "reasoning") {
          return [partWithoutProviderOptions];
        }

        const openaiOptions =
          readOpenAIOptions(partRecord.providerOptions) ??
          readOpenAIOptions(partRecord.providerMetadata);
        const encryptedContent = openaiOptions?.reasoningEncryptedContent;

        if (typeof encryptedContent !== "string") {
          return [];
        }

        return [
          {
            ...partWithoutProviderOptions,
            providerOptions: {
              openai: { reasoningEncryptedContent: encryptedContent },
            },
          },
        ];
      });

      if (strippedContent.length === 0) {
        return [];
      }

      return [
        {
          ...messageWithoutProviderOptions,
          content: strippedContent,
        } as ModelMessage,
      ];
    });
  }

  /**
   * Mark messages with cache breakpoints for Anthropic prompt caching.
   *
   * We attach providerOptions.anthropic.cacheControl to messages following this strategy:
   * 1. System message — stable across turns, biggest cache win
   * 2. Second-to-last user message — captures conversation history for multi-turn caching
   *
   * The SDK does not serialize these hints into the API request. The actual cache_control
   * injection happens in createAnthropicModel's fetch wrapper, which patches the outbound
   * request body. Both use the same strategy (system + second-to-last user).
   */
  private addAnthropicCacheBreakpoints(messages: ModelMessage[]): ModelMessage[] {
    const cacheBreakpoint = {
      anthropic: { cacheControl: { type: "ephemeral" as const } },
    };

    const result = [...messages];

    // 1. Mark the system message with a cache breakpoint
    const systemIdx = result.findIndex((m) => m.role === "system");
    if (systemIdx !== -1) {
      result[systemIdx] = {
        ...result[systemIdx],
        providerOptions: {
          ...((result[systemIdx] as ModelMessage & { providerOptions?: Record<string, unknown> }).providerOptions ?? {}),
          ...cacheBreakpoint,
        },
      } as ModelMessage;
    }

    // 2. Mark the second-to-last user message (multi-turn cache boundary)
    const userIndices = result
      .map((m, i) => (m.role === "user" ? i : -1))
      .filter((i) => i !== -1);
    if (userIndices.length >= 2) {
      const idx = userIndices[userIndices.length - 2];
      result[idx] = {
        ...result[idx],
        providerOptions: {
          ...((result[idx] as ModelMessage & { providerOptions?: Record<string, unknown> }).providerOptions ?? {}),
          ...cacheBreakpoint,
        },
      } as ModelMessage;
    }

    return result;
  }

  /**
   * Check if a model supports system messages
   */
  private supportsSystemMessages(_providerId: SupportedProvider, _modelId: string): boolean {
    return true;
  }

  /**
   * Inject the agent system prompt into messages.
   *
   * For models that support system messages: inserts a system message at the front
   * (or prepends to an existing one).
   * For models that don't support system messages (e.g. Gemma): prepends the prompt
   * to the first user message instead.
   */
  private injectContext(
    messages: ModelMessage[],
    providerId?: SupportedProvider,
    modelId?: string,
    agentSystemPrompt?: string
  ): ModelMessage[] {
    if (!agentSystemPrompt) {
      return messages;
    }

    const supportsSystem = providerId && modelId
      ? this.supportsSystemMessages(providerId, modelId)
      : true;

    if (!supportsSystem) {
      // Prepend to first user message for models that don't support system role
      const result: ModelMessage[] = [];
      let injected = false;

      for (const msg of messages) {
        if (msg.role === "system") {
          continue; // drop any existing system messages
        } else if (msg.role === "user" && !injected) {
          const userContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          result.push({
            role: "user",
            content: `${agentSystemPrompt}\n\n---\n\n${userContent}`,
          });
          injected = true;
        } else {
          result.push(msg);
        }
      }

      if (!injected) {
        result.unshift({ role: "user", content: agentSystemPrompt });
      }

      return result;
    }

    // Standard: insert / prepend system message
    const result: ModelMessage[] = [];
    let hasSystem = false;

    for (const msg of messages) {
      if (msg.role === "system") {
        result.push({
          role: "system",
          content: agentSystemPrompt + "\n\n" + (typeof msg.content === "string" ? msg.content : ""),
        });
        hasSystem = true;
      } else {
        result.push(msg);
      }
    }

    if (!hasSystem) {
      result.unshift({ role: "system", content: agentSystemPrompt });
    }

    return result;
  }

  /**
   * Get model info for a specific model
   */
  getModelInfo(modelId: string, providerId: SupportedProvider): ModelInfo {
    const defaults = MODEL_DEFAULTS[modelId] || {};
    return {
      id: modelId,
      provider: providerId,
      displayName: modelId,
      contextWindow: defaults.contextWindow || 8192,
      supportsStreaming: defaults.supportsStreaming ?? true,
      inputPricePer1k: defaults.inputPricePer1k,
      outputPricePer1k: defaults.outputPricePer1k,
    };
  }

}

// ============================================================================
// Custom Errors
// ============================================================================

export class GatewayConfigError extends Error {
  public provider: string;
  public status: number = 400;

  constructor(message: string, provider: string) {
    super(message);
    this.name = "GatewayConfigError";
    this.provider = provider;
  }
}

export class GatewayProviderError extends Error {
  public provider: string;
  public status: number;
  public originalError?: Error;

  constructor(message: string, provider: string, status: number, originalError?: Error) {
    super(message);
    this.name = "GatewayProviderError";
    this.provider = provider;
    this.status = status;
    this.originalError = originalError;
  }
}

// ============================================================================
// Singleton factory
// ============================================================================

let _instance: ModelGateway | null = null;

/**
 * Get or create the singleton ModelGateway instance
 */
export function getModelGateway(): ModelGateway {
  if (!_instance) {
    _instance = new ModelGateway();
  }
  return _instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetModelGateway(): void {
  _instance = null;
}
