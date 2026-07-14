import { findModelBySelectionKey } from "@/lib/agent/model-selection-key";
import type { ProviderCredential } from "@/lib/settings/schema";

/** Fast OpenAI fallback used when ChatGPT OAuth is the user's only configured provider. */
export const OPENAI_SUBSCRIPTION_TITLE_FALLBACK_MODEL_ID = "gpt-5.4-nano";

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

/**
 * Resolves a title model that can use a configured provider credential.
 *
 * Gemini remains the normal default. GPT-5.4 Nano is used only when that
 * preferred model has no credential and ChatGPT OAuth is the sole provider,
 * avoiding a failed title-generation request for subscription-only users.
 */
export function resolveTitleGenerationModel<T extends TitleGenerationModelOption>(
  options: ResolveTitleGenerationModelOptions<T>
): T | undefined {
  const configuredModel = findModelBySelectionKey(options.models, options.configuredModelId);
  if (configuredModel && options.credentials[configuredModel.provider]) {
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

  return configuredModel ?? findModelBySelectionKey(options.models, options.defaultModelId);
}
