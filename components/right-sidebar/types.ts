import type { NotebookType } from "@/lib/types";
import type { ModelCatalogSource } from "@/lib/agent/model-catalog";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import type { ResolvedChatReference } from "@/lib/chat/chat-references";
import type { FileUIPart } from "ai";

export type InteractionMode = string;

export interface LLM {
  value: string;
  label: string;
  provider: ProviderId;
  inputPrice?: number;
  outputPrice?: number;
  cachedPrice?: number;
  cacheWritePrice?: number;
  icon?: React.ComponentType<{ className?: string }>;
  options?: any;
  /** Provider-specific model identifier sent to the API when it differs from value. */
  apiModelId?: string;
  /** True if the matching provider credential is configured locally. */
  isAccessible?: boolean;
  /** Model context window size in tokens. */
  contextWindow?: number;
  contextWindowSource?: string;
  contextWindowFetchedAt?: string;
  contextWindowIsFallback?: boolean;
  /** Max tokens the provider reports this model can generate in one response. */
  maxOutputTokens?: number;
  /** True when the model can receive image file parts as input. */
  supportsImageInput?: boolean;
  /** True when the model reports native tool calling support. */
  supportsToolCalling?: boolean;
  /** True when the provider/model can safely force a specific tool choice. */
  supportsForcedToolChoice?: boolean;
  /** True when the model exposes reasoning-specific behavior. */
  supportsReasoning?: boolean;
  /** Token threshold where long-context pricing begins. */
  longContextThreshold?: number;
  /** Input price per million tokens after the long-context threshold. */
  longContextInputPrice?: number;
  /** Output price per million tokens after the long-context threshold. */
  longContextOutputPrice?: number;
  /** Source of the catalog metadata shown in the selector detail card. */
  catalogSource?: ModelCatalogSource;
  /** Whether the static catalog pins this model by default. */
  pinnedByDefault?: boolean;
  /** Catalog metadata timestamp. */
  catalogCreatedAt?: string;
  /** Whether this model is exposed to the client catalog. */
  clientAvailable?: boolean;
}

export interface EditingState {
  messageId: string;
  originalContent: string;
  messageIndex: number;
}

// ============================================================================
// Per-model settings (provider-specific)
// ============================================================================

export interface OpenAIModelSettings {
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
}

export interface AnthropicModelSettings {
  extendedThinking?: boolean;
  thinkingBudgetTokens?: number;
}

/** Placeholder for future Google-specific settings */
export interface GoogleModelSettings {
  // reserved
}

/** Placeholder for future xAI-specific settings */
export interface XAIModelSettings {
  // reserved
}

/** Placeholder for future local-provider settings */
export interface LocalModelSettings {
  // reserved
}

export type ModelSettings =
  | OpenAIModelSettings
  | AnthropicModelSettings
  | GoogleModelSettings
  | XAIModelSettings
  | LocalModelSettings;

/** Map of modelId → provider-specific settings */
export type ModelSettingsMap = Record<string, ModelSettings>;

/** A user message waiting to send until the agent finishes its current run. */
export interface QueuedMessage {
  id: string;
  text: string;
  references: ResolvedChatReference[];
  attachments: ChatDraftAttachment[];
}

/** Session-only file selected in the composer before a message is sent. */
export interface ChatDraftAttachment {
  id: string;
  fileName: string;
  mediaType: string;
  size: number;
  lastModified?: number;
  reference: ResolvedChatReference;
  imageFilePart?: FileUIPart;
}

export type { NotebookType };
