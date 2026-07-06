import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { ModelMessage } from "@ai-sdk/provider-utils";

import { extractTokenBreakdown } from "@/lib/agent/cost-calculator";
import type { CredentialMode, ProviderId } from "@/lib/agent/model-gateway-types";

import type { ProviderAdapter, ProviderCapabilities, ProviderMessageInput } from "./types";
import {
  injectSystemPrompt,
  normalizeGenericUsage,
  normalizeOpenAICompatibleBaseUrl,
  requestBodyText,
} from "./utils";

const CHATGPT_CODEX_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  systemMessages: true,
  toolCalling: true,
  imageInput: true,
  forcedToolChoice: false,
  reasoning: false,
  promptCaching: false,
};

function requireByok(credential: CredentialMode, providerId: ProviderId): string {
  if (credential.type !== "byok") {
    throw new Error(`${providerId} requires an API key credential.`);
  }
  return credential.apiKey;
}

function prepared(input: ProviderMessageInput, supportsSystemMessages = true): ModelMessage[] {
  return injectSystemPrompt(input.messages, input.agentSystemPrompt, supportsSystemMessages);
}

function openAICompatibleAdapter(input: {
  id: ProviderId;
  label: string;
  baseURL?: string;
  credentialKind?: "api_key" | "local_endpoint";
  imageInput?: boolean;
  forcedToolChoice?: boolean;
}): ProviderAdapter {
  return {
    id: input.id,
    label: input.label,
    credentialKind: input.credentialKind ?? "api_key",
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      imageInput: input.imageInput ?? true,
      forcedToolChoice: input.forcedToolChoice ?? false,
    },
    createModel({ credential, modelId }) {
      const apiKey =
        credential.type === "local_endpoint"
          ? credential.apiKey || "local-endpoint"
          : requireByok(credential, input.id);
      const baseURL =
        credential.type === "local_endpoint"
          ? normalizeOpenAICompatibleBaseUrl(credential.baseUrl)
          : input.baseURL ?? (credential.type === "byok" ? credential.baseUrl : undefined);
      return createOpenAI({
        apiKey,
        ...(baseURL && { baseURL }),
      }).chat(credential.type === "local_endpoint" ? credential.modelId : modelId);
    },
    prepareMessages: prepared,
    providerOptions({ modelSettings }) {
      const openai: Record<string, any> = {
        stream_options: { include_usage: true },
      };
      if (modelSettings?.reasoningEffort) {
        openai.reasoningEffort = modelSettings.reasoningEffort;
      }
      return {
        openai: {
          ...openai,
        },
      };
    },
    normalizeUsage({ usage, providerMetadata }) {
      return extractTokenBreakdown(usage, providerMetadata, input.id === "xai" ? "xai" : "openai");
    },
  };
}

function addAnthropicCacheBreakpoints(messages: ModelMessage[]): ModelMessage[] {
  const cache = {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  };
  const result = [...messages];
  const system = result.findIndex((m) => m.role === "system");

  if (system !== -1) {
    result[system] = {
      ...result[system],
      providerOptions: {
        ...((result[system] as ModelMessage & { providerOptions?: Record<string, unknown> }).providerOptions ?? {}),
        ...cache,
      },
    } as ModelMessage;
  }

  const users = result.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i !== -1);
  if (users.length >= 2) {
    const idx = users[users.length - 2];
    result[idx] = {
      ...result[idx],
      providerOptions: {
        ...((result[idx] as ModelMessage & { providerOptions?: Record<string, unknown> }).providerOptions ?? {}),
        ...cache,
      },
    } as ModelMessage;
  }

  return result;
}

function patchAnthropicBody(body: string | null): string | null {
  if (!body) return body;

  type Cache = { type: "ephemeral" };
  type Block = { type?: string; text?: string; cache_control?: Cache; [key: string]: unknown };
  type Message = { role?: string; content?: string | Block[]; [key: string]: unknown };
  type AnthropicBody = { system?: string | Block[]; messages?: Message[]; [key: string]: unknown };

  const cache: Cache = { type: "ephemeral" };
  const withCache = (content: unknown): unknown => {
    if (typeof content === "string") return [{ type: "text", text: content, cache_control: cache }];
    if (!Array.isArray(content)) return content;

    const blocks = [...content] as Block[];
    const idx = blocks.findIndex((block) => {
      if (typeof block !== "object" || block === null) return false;
      return (typeof block.type === "string" ? block.type : "text") === "text";
    });
    if (idx === -1 || blocks[idx].cache_control) return content;

    blocks[idx] = { ...blocks[idx], cache_control: cache };
    return blocks;
  };

  try {
    const parsed = JSON.parse(body) as AnthropicBody;
    if (parsed.system !== undefined) parsed.system = withCache(parsed.system) as AnthropicBody["system"];
    if (Array.isArray(parsed.messages)) {
      const users = parsed.messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i !== -1);
      if (users.length >= 2) {
        const idx = users[users.length - 2];
        parsed.messages[idx] = {
          ...parsed.messages[idx],
          content: withCache(parsed.messages[idx].content) as Message["content"],
        };
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

function stripOpenAIProviderOptions(messages: ModelMessage[]): ModelMessage[] {
  const read = (metadata: unknown): Record<string, unknown> | undefined => {
    if (typeof metadata !== "object" || metadata === null) return undefined;
    const openai = (metadata as Record<string, unknown>).openai;
    return typeof openai === "object" && openai !== null ? openai as Record<string, unknown> : undefined;
  };

  return messages.flatMap((message): ModelMessage[] => {
    const msg = message as ModelMessage & {
      providerOptions?: Record<string, unknown>;
      providerMetadata?: Record<string, unknown>;
    };
    const {
      providerOptions: _options,
      providerMetadata: _metadata,
      ...clean
    } = msg;

    if (!Array.isArray(message.content)) return [clean as ModelMessage];

    const content = message.content.flatMap((part): unknown[] => {
      if (typeof part !== "object" || part === null) return [part];
      const item = part as Record<string, unknown>;
      const {
        providerOptions: _partOptions,
        providerMetadata: _partMetadata,
        ...partClean
      } = item;

      if (item.type !== "reasoning") return [partClean];

      const encrypted =
        read(item.providerOptions)?.reasoningEncryptedContent ??
        read(item.providerMetadata)?.reasoningEncryptedContent;
      if (typeof encrypted !== "string") return [];

      return [
        {
          ...partClean,
          providerOptions: { openai: { reasoningEncryptedContent: encrypted } },
        },
      ];
    });

    if (content.length === 0) return [];
    return [{ ...clean, content } as ModelMessage];
  });
}

function patchChatGPTBody(body: string | null): string | null {
  if (!body) return body;

  type Body = {
    input?: Array<{ role: string; content: unknown }>;
    instructions?: string;
    store?: boolean;
    [key: string]: unknown;
  };

  try {
    const parsed = JSON.parse(body) as Body;
    let changed = false;

    if (Array.isArray(parsed.input) && !parsed.instructions) {
      const instructions = parsed.input.filter((m) => m.role === "system" || m.role === "developer");
      const rest = parsed.input.filter((m) => m.role !== "system" && m.role !== "developer");
      if (instructions.length > 0) {
        parsed.instructions = instructions
          .map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content))
          .join("\n\n");
        parsed.input = rest;
        changed = true;
      }
    }

    if (parsed.store !== false) {
      parsed.store = false;
      changed = true;
    }

    return changed ? JSON.stringify(parsed) : body;
  } catch {
    return body;
  }
}

const openaiAdapter = openAICompatibleAdapter({
  id: "openai",
  label: "OpenAI",
  forcedToolChoice: true,
});

const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  credentialKind: "api_key",
  capabilities: {
    ...DEFAULT_CAPABILITIES,
    forcedToolChoice: true,
    reasoning: true,
    promptCaching: true,
  },
  createModel({ credential, modelId }) {
    const apiKey = requireByok(credential, "anthropic");
    return createAnthropic({
      apiKey,
      fetch: async (req, init) => {
        const headers = new Headers(init?.headers);
        const beta = "prompt-caching-2024-07-31";
        const existing = headers.get("anthropic-beta");
        if (!existing) headers.set("anthropic-beta", beta);
        else if (!existing.includes(beta)) headers.set("anthropic-beta", `${existing},${beta}`);

        return fetch(req, {
          ...init,
          headers,
          body: patchAnthropicBody(requestBodyText(init?.body) ?? null) ?? init?.body,
        });
      },
    })(modelId);
  },
  prepareMessages(input) {
    return addAnthropicCacheBreakpoints(prepared(input));
  },
  providerOptions({ modelSettings }) {
    const extended = modelSettings?.extendedThinking ?? true;
    const budget = typeof modelSettings?.thinkingBudgetTokens === "number"
      ? modelSettings.thinkingBudgetTokens
      : 10000;
    return {
      anthropic: {
        thinking: extended ? { type: "enabled", budgetTokens: budget } : { type: "disabled" },
      },
    };
  },
  normalizeUsage({ usage, providerMetadata }) {
    return extractTokenBreakdown(usage, providerMetadata, "anthropic");
  },
};

const googleAdapter: ProviderAdapter = {
  id: "google",
  label: "Google",
  credentialKind: "api_key",
  capabilities: {
    ...DEFAULT_CAPABILITIES,
    forcedToolChoice: true,
  },
  createModel({ credential, modelId }) {
    return createGoogleGenerativeAI({ apiKey: requireByok(credential, "google") })(modelId);
  },
  prepareMessages: prepared,
  providerOptions() {
    return {};
  },
  normalizeUsage({ usage, providerMetadata }) {
    return extractTokenBreakdown(usage, providerMetadata, "google");
  },
};

const chatGPTOAuthAdapter: ProviderAdapter = {
  id: "chatgpt-oauth",
  label: "ChatGPT",
  credentialKind: "chatgpt_oauth",
  capabilities: {
    ...DEFAULT_CAPABILITIES,
    reasoning: true,
  },
  createModel({ credential, modelId }) {
    if (credential.type !== "chatgpt_oauth") throw new Error("ChatGPT OAuth credential required.");

    return createOpenAI({
      apiKey: "chatgpt-oauth-dummy",
      fetch: async (_req, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${credential.accessToken}`);
        headers.delete("api-key");
        if (credential.accountId) headers.set("ChatGPT-Account-Id", credential.accountId);
        headers.set("originator", "orion");

        return fetch(new URL(CHATGPT_CODEX_ENDPOINT), {
          ...init,
          headers,
          body: patchChatGPTBody(requestBodyText(init?.body) ?? null) ?? init?.body,
        });
      },
    }).responses(modelId);
  },
  prepareMessages(input) {
    return stripOpenAIProviderOptions(prepared(input));
  },
  providerOptions: openaiAdapter.providerOptions,
  normalizeUsage: openaiAdapter.normalizeUsage,
};

const vercelAdapter: ProviderAdapter = {
  id: "vercel",
  label: "Vercel AI Gateway",
  credentialKind: "api_key",
  capabilities: DEFAULT_CAPABILITIES,
  createModel({ credential, modelId }) {
    return createGateway({ apiKey: requireByok(credential, "vercel") }).languageModel(modelId);
  },
  prepareMessages: prepared,
  providerOptions() {
    return {};
  },
  normalizeUsage({ usage, providerMetadata }) {
    return normalizeGenericUsage({ usage, providerMetadata, providerId: "vercel" });
  },
};

const adapters: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  xai: openAICompatibleAdapter({ id: "xai", label: "xAI", baseURL: "https://api.x.ai/v1" }),
  groq: openAICompatibleAdapter({ id: "groq", label: "Groq", baseURL: "https://api.groq.com/openai/v1" }),
  cerebras: openAICompatibleAdapter({ id: "cerebras", label: "Cerebras", baseURL: "https://api.cerebras.ai/v1" }),
  vercel: vercelAdapter,
  ollama: openAICompatibleAdapter({ id: "ollama", label: "Ollama", credentialKind: "local_endpoint", imageInput: false }),
  lmstudio: openAICompatibleAdapter({ id: "lmstudio", label: "LM Studio", credentialKind: "local_endpoint", imageInput: false }),
  mlx: openAICompatibleAdapter({ id: "mlx", label: "MLX", credentialKind: "local_endpoint", imageInput: false }),
  custom: openAICompatibleAdapter({ id: "custom", label: "Custom Endpoint", credentialKind: "local_endpoint", imageInput: false }),
};

export const BUILT_IN_PROVIDER_IDS = Object.keys(adapters);

/** Return the registered adapter, including custom OpenAI-compatible provider IDs. */
export function getProviderAdapter(providerId: ProviderId, credential?: CredentialMode): ProviderAdapter | undefined {
  if (providerId === "openai" && credential?.type === "chatgpt_oauth") return chatGPTOAuthAdapter;
  if (adapters[providerId]) return adapters[providerId];
  if (credential?.type === "local_endpoint") {
    return openAICompatibleAdapter({
      id: providerId,
      label: credential.label ?? providerId,
      credentialKind: "local_endpoint",
      imageInput: false,
    });
  }
  if (credential?.type === "byok" && credential.baseUrl) {
    return openAICompatibleAdapter({
      id: providerId,
      label: providerId,
      baseURL: normalizeOpenAICompatibleBaseUrl(credential.baseUrl),
    });
  }
  return undefined;
}

export function isProviderSupported(providerId: ProviderId, credential?: CredentialMode): boolean {
  return getProviderAdapter(providerId, credential) !== undefined;
}
