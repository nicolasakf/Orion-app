// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Vercel Gateway model catalog", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("normalizes model limits, cache prices, and tiered long-context rates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "google/gemini-test",
        name: "Gemini Test",
        created: 1_700_000_000,
        context_window: 1_000_000,
        max_tokens: 64_000,
        tags: ["vision", "tool-use", "reasoning"],
        pricing: {
          input: "0.000002",
          output: "0.000012",
          input_cache_read: "0.0000002",
          input_cache_write: "0.000002",
          input_tiers: [
            { cost: "0.000002", min: 0, max: 200_001 },
            { cost: "0.000004", min: 200_001 },
          ],
          output_tiers: [{ cost: "0.000018", min: 200_001 }],
          input_cache_read_tiers: [{ cost: "0.0000004", min: 200_001 }],
          input_cache_write_tiers: [{ cost: "0.000004", min: 200_001 }],
        },
      }],
    }), { status: 200 })));
    const { fetchVercelGatewayCatalog } = await import("./vercel-gateway-catalog.server");

    await expect(fetchVercelGatewayCatalog()).resolves.toMatchObject([{
      provider_id: "vercel",
      model_id: "google/gemini-test",
      context_window: 1_000_000,
      max_output_tokens: 64_000,
      input_price_per_1m: 2,
      output_price_per_1m: 12,
      cached_price_per_1m: 0.2,
      cache_write_price_per_1m: 2,
      long_context_threshold: 200_000,
      long_context_input_price_per_1m: 4,
      long_context_output_price_per_1m: 18,
      long_context_cached_price_per_1m: 0.4,
      long_context_cache_write_price_per_1m: 4,
      context_window_source: "vercel_gateway",
    }]);
  });
});
