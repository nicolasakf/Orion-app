import { findModelBySelectionKey } from "@/lib/agent/model-selection-key";
import type { ProviderCredential } from "@/lib/settings/schema";

/** Fast OpenAI fallback supported by the ChatGPT subscription-backed Codex API. */
export const OPENAI_SUBSCRIPTION_TITLE_FALLBACK_MODEL_ID = "gpt-5.4-mini";

/** OpenAI API models that the ChatGPT subscription-backed Codex API rejects. */
const UNSUPPORTED_OPENAI_SUBSCRIPTION_TITLE_MODEL_IDS = new Set(["gpt-5.4-nano"]);

export interface TitleGenerationModelOption {
  value: string;
  provider: string;
}

interface ResolveTitleGenerationModelOptions<T extends TitleGenerationModelOption> {
  configuredModelId: string;
  defaultModelId: string;
  models: readonly T[];
  credentials: Record<string, ProviderCredential>;
}

/** Returns whether ChatGPT OAuth is the user's sole configured inference provider. */
function hasOnlyOpenAISubscription(
  credentials: Record<string, ProviderCredential>
): boolean {
  return (
    credentials.openai?.type === "chatgpt_oauth" &&
    Object.entries(credentials).every(([providerId, credential]) =>
      providerId === "openai" || credential === undefined
    )
  );
}

/** Returns whether a saved model is explicitly unsupported by ChatGPT OAuth. */
function isUnsupportedOpenAISubscriptionModel(
  model: TitleGenerationModelOption,
  credentials: Record<string, ProviderCredential>
): boolean {
  return (
    model.provider === "openai" &&
    credentials.openai?.type === "chatgpt_oauth" &&
    UNSUPPORTED_OPENAI_SUBSCRIPTION_TITLE_MODEL_IDS.has(model.value)
  );
}

/** Returns whether the configured model is compatible with its saved credential. */
function canUseConfiguredModel(
  model: TitleGenerationModelOption,
  credentials: Record<string, ProviderCredential>
): boolean {
  return Boolean(credentials[model.provider]) && !isUnsupportedOpenAISubscriptionModel(model, credentials);
}

/**
 * Resolves a title model that can use a configured provider credential.
 *
 * Gemini remains the normal default. GPT-5.4 Mini is used only when that
 * preferred model has no usable credential and ChatGPT OAuth is the sole
 * provider, avoiding failed title-generation requests for subscription users.
 */
export function resolveTitleGenerationModel<T extends TitleGenerationModelOption>(
  options: ResolveTitleGenerationModelOptions<T>
): T | undefined {
  const configuredModel = findModelBySelectionKey(options.models, options.configuredModelId);
  if (configuredModel && canUseConfiguredModel(configuredModel, options.credentials)) {
    return configuredModel;
  }

  if (hasOnlyOpenAISubscription(options.credentials)) {
    const openAIFallback = options.models.find(
      (model) =>
        model.provider === "openai" &&
        model.value === OPENAI_SUBSCRIPTION_TITLE_FALLBACK_MODEL_ID
    );
    if (openAIFallback) return openAIFallback;
  }

  if (configuredModel && isUnsupportedOpenAISubscriptionModel(configuredModel, options.credentials)) {
    const defaultModel = findModelBySelectionKey(options.models, options.defaultModelId);
    return (
      (defaultModel && canUseConfiguredModel(defaultModel, options.credentials)
        ? defaultModel
        : undefined) ??
      options.models.find((model) => canUseConfiguredModel(model, options.credentials)) ??
      defaultModel
    );
  }

  return configuredModel ?? findModelBySelectionKey(options.models, options.defaultModelId);
}
