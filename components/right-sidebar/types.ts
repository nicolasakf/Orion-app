import type { NotebookType } from "@/lib/types";

export type InteractionMode = "Agent" | "Ask" | "Edit";

export interface LLM {
  value: string;
  label: string;
  provider: "google" | "openai" | "anthropic" | "xai";
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

export type ModelSettings =
  | OpenAIModelSettings
  | AnthropicModelSettings
  | GoogleModelSettings
  | XAIModelSettings;

/** Map of modelId → provider-specific settings */
export type ModelSettingsMap = Record<string, ModelSettings>;

export type { NotebookType };
