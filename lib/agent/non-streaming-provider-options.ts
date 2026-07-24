import type { ProviderOptions } from "@ai-sdk/provider-utils";

/**
 * Removes streaming and long-reasoning options from short title generations.
 */
export function sanitizeTitleGenerationProviderOptions(
  providerOptions: ProviderOptions
): ProviderOptions {
  let sanitizedOptions = providerOptions;
  const openAIOptions = providerOptions.openai;
  if (openAIOptions && "stream_options" in openAIOptions) {
    const { stream_options: _streamOptions, ...nonStreamingOptions } = openAIOptions;
    sanitizedOptions = {
      ...sanitizedOptions,
      openai: nonStreamingOptions,
    };
  }

  const anthropicOptions = providerOptions.anthropic;
  const anthropicThinking = anthropicOptions?.thinking;
  if (
    anthropicOptions &&
    typeof anthropicThinking === "object" &&
    anthropicThinking !== null &&
    "type" in anthropicThinking &&
    anthropicThinking.type === "enabled"
  ) {
    const { thinking: _thinking, ...shortGenerationOptions } = anthropicOptions;
    sanitizedOptions = {
      ...sanitizedOptions,
      anthropic: shortGenerationOptions,
    };
  }

  return sanitizedOptions;
}
