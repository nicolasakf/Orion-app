import type { LanguageModelUsage, ProviderMetadata } from "ai";
import { z } from "zod";

export interface ModelPricing {
  provider_id: string;
  input_price_per_1m: number | null;
  output_price_per_1m: number | null;
  cached_price_per_1m: number | null;
  cache_write_price_per_1m?: number | null;
  long_context_threshold: number | null;
  long_context_input_price_per_1m: number | null;
  long_context_output_price_per_1m: number | null;
  long_context_cached_price_per_1m?: number | null;
  long_context_cache_write_price_per_1m?: number | null;
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

const OpenAiUsageMetadataSchema = z.object({
  cachedPromptTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
}).passthrough();

const AnthropicUsageMetadataSchema = z.object({
  cacheCreationInputTokens: z.number().optional(),
  cacheReadInputTokens: z.number().optional(),
}).passthrough();

const GoogleUsageMetadataSchema = z.object({
  usageMetadata: z.object({
    cachedContentTokenCount: z.number().optional(),
    thoughtsTokenCount: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

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
  const noCacheInput = safeNum(usage.inputTokenDetails?.noCacheTokens);
  const reasoning = safeNum(usage.outputTokenDetails?.reasoningTokens);
  const meta = providerMetadata ?? {};

  switch (providerId) {
    case "anthropic": {
      const anthropicMeta = AnthropicUsageMetadataSchema.safeParse(meta.anthropic);
      const cacheCreation =
        cacheWrite || safeNum(anthropicMeta.success ? anthropicMeta.data.cacheCreationInputTokens : 0);
      const cacheReadFinal =
        cacheRead || safeNum(anthropicMeta.success ? anthropicMeta.data.cacheReadInputTokens : 0);
      return {
        standardInputTokens:
          noCacheInput || Math.max(0, inputTokens - cacheCreation - cacheReadFinal),
        cacheCreationTokens: cacheCreation,
        cacheReadTokens: cacheReadFinal,
        outputTokens,
        reasoningTokens: 0,
      };
    }

    case "openai": {
      const openAiMeta = OpenAiUsageMetadataSchema.safeParse(meta.openai);
      const cachedFinal =
        cacheRead ||
        safeNum(openAiMeta.success
          ? openAiMeta.data.cachedPromptTokens ?? openAiMeta.data.cachedInputTokens
          : 0);
      const reasoningFinal =
        reasoning || safeNum(openAiMeta.success ? openAiMeta.data.reasoningTokens : 0);
      return {
        standardInputTokens: noCacheInput || Math.max(0, inputTokens - cachedFinal),
        cacheCreationTokens: 0,
        cacheReadTokens: cachedFinal,
        outputTokens: Math.max(0, outputTokens - reasoningFinal),
        reasoningTokens: reasoningFinal,
      };
    }

    case "google": {
      const googleMeta = GoogleUsageMetadataSchema.safeParse(meta.google);
      const metadata = googleMeta.success ? googleMeta.data.usageMetadata : undefined;
      const cachedFinal = cacheRead || safeNum(metadata?.cachedContentTokenCount);
      const thinkingFinal = reasoning || safeNum(metadata?.thoughtsTokenCount);
      return {
        standardInputTokens: noCacheInput || Math.max(0, inputTokens - cachedFinal),
        cacheCreationTokens: 0,
        cacheReadTokens: cachedFinal,
        outputTokens: Math.max(0, outputTokens - thinkingFinal),
        reasoningTokens: thinkingFinal,
      };
    }

    case "xai": {
      const openAiMeta = OpenAiUsageMetadataSchema.safeParse(meta.openai);
      const cachedFinal =
        cacheRead ||
        safeNum(openAiMeta.success
          ? openAiMeta.data.cachedPromptTokens ?? openAiMeta.data.cachedInputTokens
          : 0);
      return {
        standardInputTokens: noCacheInput || Math.max(0, inputTokens - cachedFinal),
        cacheCreationTokens: 0,
        cacheReadTokens: cachedFinal,
        outputTokens,
        reasoningTokens: 0,
      };
    }

    default:
      return {
        standardInputTokens: noCacheInput || Math.max(0, inputTokens - cacheWrite - cacheRead),
        cacheCreationTokens: cacheWrite,
        cacheReadTokens: cacheRead,
        outputTokens,
        reasoningTokens: reasoning,
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
    (isLongContext ? pricing.long_context_cache_write_price_per_1m : null) ??
    pricing.cache_write_price_per_1m ??
    (pricing.provider_id === "anthropic" ? inputRate * 1.25 : inputRate);
  const cacheReadRate =
    (isLongContext ? pricing.long_context_cached_price_per_1m : null) ??
    pricing.cached_price_per_1m ??
    0;
  const totalOutputTokens = tokens.outputTokens + tokens.reasoningTokens;

  return (
    (tokens.standardInputTokens * inputRate) / 1_000_000 +
    (tokens.cacheCreationTokens * cacheCreationRate) / 1_000_000 +
    (tokens.cacheReadTokens * cacheReadRate) / 1_000_000 +
    (totalOutputTokens * outputRate) / 1_000_000
  );
}
