/**
 * ModelGateway - provider-agnostic LLM orchestration.
 *
 * Provider-specific request construction lives in `lib/agent/providers/*`.
 * This class resolves the right adapter, validates credential shape, and returns
 * the model/messages/options tuple consumed by AI SDK `streamText`/`generateText`.
 */

import type { ModelMessage } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";

import { getModelCatalogEntry } from "@/lib/agent/model-catalog";
import { getProviderAdapter } from "@/lib/agent/providers/registry";
import { normalizeOpenAICompatibleBaseUrl } from "@/lib/agent/providers/utils";
import type { CredentialMode, ProviderId } from "./model-gateway-types";
import { isLocalProvider } from "./local-provider-models";

export { normalizeOpenAICompatibleBaseUrl };
export type { CredentialMode, ProviderId, SupportedProvider } from "./model-gateway-types";

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  options?: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  displayName: string;
  contextWindow: number;
  supportsStreaming: boolean;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
}

export interface GatewayRequest {
  messages: ModelMessage[];
  modelId: string;
  providerId: ProviderId;
  agentSystemPrompt?: string;
  requestId?: string;
  modelSettings?: Record<string, unknown>;
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

export class ModelGateway {
  /** Create a model instance for compatibility with older direct callers. */
  createModel(providerId: ProviderId, modelId: string, config: ProviderConfig): LanguageModel {
    const credential: CredentialMode = isLocalProvider(providerId)
      ? {
          type: "local_endpoint",
          baseUrl: config.baseUrl ?? "",
          modelId,
          apiKey: config.apiKey,
        }
      : { type: "byok", apiKey: config.apiKey };
    const adapter = getProviderAdapter(providerId, credential);
    if (!adapter) throw new GatewayConfigError(`Unsupported provider: ${providerId}`, providerId);
    return adapter.createModel({
      providerId,
      modelId,
      credential,
      options: config.options,
    });
  }

  /** Return provider-specific AI SDK providerOptions. */
  getProviderOptions(providerId: ProviderId, modelSettings?: Record<string, unknown>): Record<string, any> {
    const adapter = getProviderAdapter(providerId);
    return adapter?.providerOptions({ modelSettings }) ?? {};
  }

  /**
   * Process a gateway request and return model + processed messages.
   *
   * The selected adapter handles system prompt injection, request quirks, and
   * providerOptions. Missing adapters are treated as configuration errors.
   */
  processRequest(request: GatewayRequest): GatewayResponse {
    const { messages, modelId, providerId, agentSystemPrompt, modelSettings, credentials } = request;

    if (!credentials) {
      throw new GatewayConfigError(`${providerId} credential not provided`, providerId);
    }

    const adapter = getProviderAdapter(providerId, credentials);
    if (!adapter) {
      throw new GatewayConfigError(`Unsupported provider: ${providerId}`, providerId);
    }

    const model = adapter.createModel({
      providerId,
      modelId,
      credential: credentials,
      options: request.options,
    });
    const prepared = adapter.prepareMessages({
      messages,
      providerId,
      modelId,
      agentSystemPrompt,
      credential: credentials,
    });

    return {
      model,
      messages: prepared,
      providerOptions: adapter.providerOptions({ modelSettings }),
    };
  }

  /** Get model metadata for context budgeting and legacy callers. */
  getModelInfo(modelId: string, providerId: ProviderId): ModelInfo {
    const entry = getModelCatalogEntry(modelId);
    return {
      id: modelId,
      provider: providerId,
      displayName: entry?.label ?? modelId,
      contextWindow: entry?.context_window ?? 8192,
      supportsStreaming: true,
      inputPricePer1k: entry?.input_price_per_1m == null ? undefined : entry.input_price_per_1m / 1000,
      outputPricePer1k: entry?.output_price_per_1m == null ? undefined : entry.output_price_per_1m / 1000,
    };
  }
}

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

let instance: ModelGateway | null = null;

/** Get or create the singleton ModelGateway instance. */
export function getModelGateway(): ModelGateway {
  instance ??= new ModelGateway();
  return instance;
}

/** Reset the singleton instance for tests. */
export function resetModelGateway(): void {
  instance = null;
}
