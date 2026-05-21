import type { LanguageModelUsage, ProviderMetadata } from "ai";

export interface ModelPricing {
  provider_id: string;
  input_price_per_1m: number | null;
  output_price_per_1m: number | null;
  cached_price_per_1m: number | null;
  long_context_threshold: number | null;
  long_context_input_price_per_1m: number | null;
  long_context_output_price_per_1m: number | null;
}

export interface TokenBreakdown {
  standardInputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

/** Coerces provider metadata values to finite numbers for cost arithmetic. */
function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Extracts billable token categories from AI SDK usage plus provider metadata.
 */
export function extractTokenBreakdown(
  usage: LanguageModelUsage,
  providerMetadata: ProviderMetadata | undefined,
  providerId: string
): TokenBreakdown {
  const inputTokens = safeNum(usage.inputTokens);
  const outputTokens = safeNum(usage.outputTokens);
  const cacheRead = safeNum(usage.inputTokenDetails?.cacheReadTokens);
  const cacheWrite = safeNum(usage.inputTokenDetails?.cacheWriteTokens);
  const reasoning = safeNum(usage.outputTokenDetails?.reasoningTokens);
  const meta = providerMetadata ?? {};

  switch (providerId) {
    case "anthropic": {
      const anthropicMeta = meta.anthropic as Record<string, unknown> | undefined;
      const cacheCreation =
        cacheWrite || safeNum(anthropicMeta?.cacheCreationInputTokens);
      const cacheReadFinal =
        cacheRead || safeNum(anthropicMeta?.cacheReadInputTokens);
      return {
        standardInputTokens: inputTokens,
        cacheCreationTokens: cacheCreation,
        cacheReadTokens: cacheReadFinal,
        outputTokens,
        reasoningTokens: 0,
      };
    }

    case "openai": {
      const openAiMeta = meta.openai as Record<string, unknown> | undefined;
      const cachedFinal =
        cacheRead ||
        safeNum(openAiMeta?.cachedPromptTokens ?? openAiMeta?.cachedInputTokens);
      const reasoningFinal =
        reasoning || safeNum(openAiMeta?.reasoningTokens);
      return {
        standardInputTokens: Math.max(0, inputTokens - cachedFinal),
        cacheCreationTokens: 0,
        cacheReadTokens: cachedFinal,
        outputTokens: Math.max(0, outputTokens - reasoningFinal),
        reasoningTokens: reasoningFinal,
      };
    }

    case "google": {
      const googleMeta = (
        (meta.google as Record<string, unknown> | undefined)?.usageMetadata ?? {}
      ) as Record<string, unknown>;
      const cachedFinal = cacheRead || safeNum(googleMeta.cachedContentTokenCount);
      const thinkingFinal = reasoning || safeNum(googleMeta.thoughtsTokenCount);
      return {
        standardInputTokens: Math.max(0, inputTokens - cachedFinal),
        cacheCreationTokens: 0,
        cacheReadTokens: cachedFinal,
        outputTokens: Math.max(0, outputTokens - thinkingFinal),
        reasoningTokens: thinkingFinal,
      };
    }

    case "xai": {
      const openAiMeta = meta.openai as Record<string, unknown> | undefined;
      const cachedFinal =
        cacheRead ||
        safeNum(openAiMeta?.cachedPromptTokens ?? openAiMeta?.cachedInputTokens);
      return {
        standardInputTokens: Math.max(0, inputTokens - cachedFinal),
        cacheCreationTokens: 0,
        cacheReadTokens: cachedFinal,
        outputTokens,
        reasoningTokens: 0,
      };
    }

    default:
      return {
        standardInputTokens: inputTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        outputTokens,
        reasoningTokens: 0,
      };
  }
}

/**
 * Calculates estimated USD cost from model pricing and token categories.
 */
export function calculateCostUsd(
  pricing: ModelPricing,
  tokens: TokenBreakdown
): number | null {
  if (pricing.input_price_per_1m == null || pricing.output_price_per_1m == null) {
    return null;
  }

  const totalInputTokens =
    tokens.standardInputTokens + tokens.cacheCreationTokens + tokens.cacheReadTokens;
  const isLongContext =
    pricing.long_context_threshold !== null &&
    totalInputTokens > pricing.long_context_threshold &&
    pricing.long_context_input_price_per_1m !== null;

  const inputRate = isLongContext
    ? (pricing.long_context_input_price_per_1m ?? pricing.input_price_per_1m)
    : pricing.input_price_per_1m;
  const outputRate = isLongContext
    ? (pricing.long_context_output_price_per_1m ?? pricing.output_price_per_1m)
    : pricing.output_price_per_1m;
  const cacheCreationRate =
    pricing.provider_id === "anthropic" ? inputRate * 1.25 : 0;
  const cacheReadRate = pricing.cached_price_per_1m ?? 0;
  const totalOutputTokens = tokens.outputTokens + tokens.reasoningTokens;

  return (
    (tokens.standardInputTokens * inputRate) / 1_000_000 +
    (tokens.cacheCreationTokens * cacheCreationRate) / 1_000_000 +
    (tokens.cacheReadTokens * cacheReadRate) / 1_000_000 +
    (totalOutputTokens * outputRate) / 1_000_000
  );
}
