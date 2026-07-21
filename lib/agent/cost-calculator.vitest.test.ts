import type { LanguageModelUsage, ProviderMetadata } from "ai";
import { describe, expect, it } from "vitest";

import {
  calculateCostUsd,
  extractTokenBreakdown,
  type ModelPricing,
} from "@/lib/agent/cost-calculator";

const basePricing: ModelPricing = {
  provider_id: "openai",
  input_price_per_1m: 5,
  output_price_per_1m: 30,
  cached_price_per_1m: 0.5,
  long_context_threshold: null,
  long_context_input_price_per_1m: null,
  long_context_output_price_per_1m: null,
};

/** Builds synthetic AI SDK usage objects with only fields relevant to tests. */
function usage(value: Record<string, unknown>): LanguageModelUsage {
  return value as unknown as LanguageModelUsage;
}

describe("cost calculator", () => {
  it("extracts OpenAI cached and reasoning tokens", () => {
    const breakdown = extractTokenBreakdown(
      usage({
        inputTokens: 1000,
        outputTokens: 300,
        inputTokenDetails: { cacheReadTokens: 200 },
        outputTokenDetails: { reasoningTokens: 50 },
      }),
      undefined,
      "openai"
    );

    expect(breakdown).toEqual({
      standardInputTokens: 800,
      cacheCreationTokens: 0,
      cacheReadTokens: 200,
      outputTokens: 250,
      reasoningTokens: 50,
    });
  });

  it("extracts Anthropic cache write/read tokens from provider metadata", () => {
    const breakdown = extractTokenBreakdown(
      usage({ inputTokens: 1000, outputTokens: 300 }),
      {
        anthropic: {
          cacheCreationInputTokens: 120,
          cacheReadInputTokens: 80,
        },
      } as ProviderMetadata,
      "anthropic"
    );

    expect(breakdown).toMatchObject({
      standardInputTokens: 800,
      cacheCreationTokens: 120,
      cacheReadTokens: 80,
      outputTokens: 300,
      reasoningTokens: 0,
    });
  });

  it("extracts Google cached and thinking tokens", () => {
    const breakdown = extractTokenBreakdown(
      usage({ inputTokens: 1000, outputTokens: 300 }),
      {
        google: {
          usageMetadata: {
            cachedContentTokenCount: 100,
            thoughtsTokenCount: 40,
          },
        },
      } as ProviderMetadata,
      "google"
    );

    expect(breakdown).toMatchObject({
      standardInputTokens: 900,
      cacheReadTokens: 100,
      outputTokens: 260,
      reasoningTokens: 40,
    });
  });

  it("extracts xAI cached tokens from OpenAI-compatible metadata", () => {
    const breakdown = extractTokenBreakdown(
      usage({ inputTokens: 1000, outputTokens: 300 }),
      { openai: { cachedPromptTokens: 125 } } as ProviderMetadata,
      "xai"
    );

    expect(breakdown).toMatchObject({
      standardInputTokens: 875,
      cacheReadTokens: 125,
      outputTokens: 300,
      reasoningTokens: 0,
    });
  });

  it("uses default token extraction for unknown providers", () => {
    expect(
      extractTokenBreakdown(
        usage({ inputTokens: 10, outputTokens: 5 }),
        undefined,
        "local"
      )
    ).toEqual({
      standardInputTokens: 10,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 5,
      reasoningTokens: 0,
    });
  });

  it("does not double-count generic cache categories", () => {
    expect(
      extractTokenBreakdown(
        usage({
          inputTokens: 1000,
          outputTokens: 5,
          inputTokenDetails: { cacheReadTokens: 200, cacheWriteTokens: 100 },
        }),
        undefined,
        "vercel"
      )
    ).toMatchObject({
      standardInputTokens: 700,
      cacheCreationTokens: 100,
      cacheReadTokens: 200,
    });
  });

  it("does not double-count generic reasoning tokens", () => {
    expect(
      extractTokenBreakdown(
        usage({
          inputTokens: 10,
          outputTokens: 50,
          outputTokenDetails: { reasoningTokens: 20 },
        }),
        undefined,
        "vercel"
      )
    ).toMatchObject({
      outputTokens: 30,
      reasoningTokens: 20,
    });
  });

  it("calculates cached, reasoning, and output cost", () => {
    const cost = calculateCostUsd(basePricing, {
      standardInputTokens: 800,
      cacheCreationTokens: 0,
      cacheReadTokens: 200,
      outputTokens: 250,
      reasoningTokens: 50,
    });

    expect(cost).toBeCloseTo(0.0131, 8);
  });

  it("charges Anthropic cache creation at 1.25x input", () => {
    const cost = calculateCostUsd(
      { ...basePricing, provider_id: "anthropic" },
      {
        standardInputTokens: 1000,
        cacheCreationTokens: 100,
        cacheReadTokens: 100,
        outputTokens: 100,
        reasoningTokens: 0,
      }
    );

    expect(cost).toBeCloseTo(0.008675, 8);
  });

  it("uses long-context rates after the threshold", () => {
    const cost = calculateCostUsd(
      {
        ...basePricing,
        long_context_threshold: 1000,
        long_context_input_price_per_1m: 10,
        long_context_output_price_per_1m: 45,
      },
      {
        standardInputTokens: 1001,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 100,
        reasoningTokens: 0,
      }
    );

    expect(cost).toBeCloseTo(0.01451, 8);
  });

  it("uses snapshotted long-context cache read and write rates", () => {
    const cost = calculateCostUsd(
      {
        ...basePricing,
        cache_write_price_per_1m: 6,
        long_context_threshold: 1000,
        long_context_input_price_per_1m: 10,
        long_context_output_price_per_1m: 45,
        long_context_cached_price_per_1m: 1,
        long_context_cache_write_price_per_1m: 12,
      },
      {
        standardInputTokens: 801,
        cacheCreationTokens: 100,
        cacheReadTokens: 100,
        outputTokens: 0,
        reasoningTokens: 0,
      }
    );

    expect(cost).toBeCloseTo(0.00931, 8);
  });

  it("returns null when pricing is incomplete", () => {
    expect(
      calculateCostUsd(
        { ...basePricing, input_price_per_1m: null },
        {
          standardInputTokens: 1,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 1,
          reasoningTokens: 0,
        }
      )
    ).toBeNull();
  });
});
