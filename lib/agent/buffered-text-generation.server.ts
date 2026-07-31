import type { ModelMessage, ProviderOptions } from "@ai-sdk/provider-utils";
import {
  generateText,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
  type ProviderMetadata,
} from "ai";

import type { CredentialMode } from "@/lib/agent/model-gateway-types";

interface BufferedTextGenerationOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  system?: string;
  providerOptions?: ProviderOptions;
  maxOutputTokens: number;
}

interface BufferedTextGenerationResult {
  text: string;
  usage: LanguageModelUsage;
  providerMetadata: ProviderMetadata | undefined;
}

/**
 * Generates a buffered text result while honoring providers that require
 * streaming requests even when Orion does not expose a stream to the caller.
 */
export async function generateBufferedText(
  options: BufferedTextGenerationOptions,
  credentialType: CredentialMode["type"],
): Promise<BufferedTextGenerationResult> {
  if (credentialType !== "chatgpt_oauth") {
    const result = await generateText(options);
    return {
      text: result.text,
      usage: result.usage,
      providerMetadata: result.providerMetadata,
    };
  }

  let firstStreamError: unknown;
  let hasStreamError = false;
  const result = streamText({
    ...options,
    onError: ({ error }) => {
      if (hasStreamError) return;
      firstStreamError = error;
      hasStreamError = true;
    },
  });

  try {
    const [text, usage, providerMetadata] = await Promise.all([
      result.text,
      result.usage,
      result.providerMetadata,
    ]);
    if (hasStreamError) throw firstStreamError;
    return { text, usage, providerMetadata };
  } catch (error) {
    if (hasStreamError) throw firstStreamError;
    throw error;
  }
}
