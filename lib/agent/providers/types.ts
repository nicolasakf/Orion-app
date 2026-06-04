import type { ModelMessage } from "@ai-sdk/provider-utils";
import type { LanguageModel, LanguageModelUsage, ProviderMetadata } from "ai";

import type { TokenBreakdown } from "@/lib/agent/cost-calculator";
import type { CredentialMode, ProviderId } from "@/lib/agent/model-gateway-types";

export type ProviderCredentialKind = "api_key" | "local_endpoint" | "chatgpt_oauth";

export interface ProviderCapabilities {
  systemMessages: boolean;
  toolCalling: boolean;
  imageInput: boolean;
  reasoning: boolean;
  promptCaching: boolean;
}

export interface ProviderModelInput {
  providerId: ProviderId;
  modelId: string;
  credential: CredentialMode;
  options?: Record<string, unknown>;
}

export interface ProviderMessageInput {
  messages: ModelMessage[];
  providerId: ProviderId;
  modelId: string;
  agentSystemPrompt?: string;
  credential: CredentialMode;
}

export interface ProviderOptionsInput {
  modelSettings?: Record<string, unknown>;
}

export interface ProviderUsageInput {
  usage: LanguageModelUsage;
  providerMetadata: ProviderMetadata | undefined;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  credentialKind: ProviderCredentialKind;
  capabilities: ProviderCapabilities;
  createModel(input: ProviderModelInput): LanguageModel;
  prepareMessages(input: ProviderMessageInput): ModelMessage[];
  providerOptions(input: ProviderOptionsInput): Record<string, any>;
  normalizeUsage(input: ProviderUsageInput): TokenBreakdown;
}
