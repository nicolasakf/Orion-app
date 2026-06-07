import type { NotebookType } from "@/lib/types";
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
  icon?: React.ComponentType<{ className?: string }>;
  options?: any;
  /** True if the matching provider credential is configured locally. */
  isAccessible?: boolean;
  /** Model context window size in tokens. */
  contextWindow?: number;
  /** True when the model can receive image file parts as input. */
  supportsImageInput?: boolean;
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
