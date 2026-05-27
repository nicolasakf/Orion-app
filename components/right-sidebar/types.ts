import type { NotebookType } from "@/lib/types";
import type { SupportedProvider } from "@/lib/agent/model-gateway-types";
import type { ResolvedChatReference } from "@/lib/chat/chat-references";

export type InteractionMode = "Agent" | "Ask" | "Edit";

export interface LLM {
  value: string;
  label: string;
  provider: SupportedProvider;
  inputPrice?: number;
  outputPrice?: number;
  icon?: React.ComponentType<{ className?: string }>;
  options?: any;
  /** True if the matching provider credential is configured locally. */
  isAccessible?: boolean;
  /** Model context window size in tokens. */
  contextWindow?: number;
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
  reasoningEffort?: "low" | "medium" | "high" | "extra-high";
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
}

export type { NotebookType };
