import "server-only";

import { z } from "zod";

import type { ModelCatalogEntry } from "@/lib/agent/model-catalog";
import { parseReasoningOptions } from "@/lib/agent/reasoning-options.server";

const VERCEL_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000;

const PricingTierSchema = z.object({
  cost: z.string(),
  min: z.number().int().nonnegative(),
  max: z.number().int().positive().optional(),
});

const VercelGatewayModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  created: z.number().optional(),
  context_window: z.number().int().positive().optional(),
  max_tokens: z.number().int().positive().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  reasoning_options: z.unknown().optional(),
  pricing: z
    .object({
      input: z.string().optional(),
      output: z.string().optional(),
      input_cache_read: z.string().optional(),
      input_cache_write: z.string().optional(),
      input_tiers: z.array(PricingTierSchema).optional(),
      output_tiers: z.array(PricingTierSchema).optional(),
      input_cache_read_tiers: z.array(PricingTierSchema).optional(),
      input_cache_write_tiers: z.array(PricingTierSchema).optional(),
    })
    .optional(),
});

const VercelGatewayModelsResponseSchema = z.object({
  data: z.array(VercelGatewayModelSchema),
});

let cache: { expiresAt: number; rows: ModelCatalogEntry[] } | undefined;

/** Converts a per-token decimal string into Orion's per-million-token unit. */
function pricePerMillion(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Number((parsed * 1_000_000).toPrecision(12))
    : null;
}

/** Resolves the first higher-context tier and its inclusive threshold. */
function higherTier(
  tiers: Array<z.infer<typeof PricingTierSchema>> | undefined
): { threshold: number; pricePerMillion: number } | null {
  const tier = tiers?.filter((candidate) => candidate.min > 0)
    .sort((left, right) => left.min - right.min)[0];
  const price = pricePerMillion(tier?.cost);
  return tier && price != null
    ? { threshold: Math.max(0, tier.min - 1), pricePerMillion: price }
    : null;
}

/** Fetches authoritative Vercel AI Gateway model metadata with a short memory cache. */
export async function fetchVercelGatewayCatalog(): Promise<ModelCatalogEntry[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;

  const response = await fetch(VERCEL_MODELS_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Vercel AI Gateway returned HTTP ${response.status}`);
  }

  const parsed = VercelGatewayModelsResponseSchema.parse(await response.json());
  const fetchedAt = new Date().toISOString();
  const rows = parsed.data
    .filter((model) => model.type == null || model.type === "language")
    .map((model): ModelCatalogEntry => {
      const inputTier = higherTier(model.pricing?.input_tiers);
      const outputTier = higherTier(model.pricing?.output_tiers);
      const cacheReadTier = higherTier(model.pricing?.input_cache_read_tiers);
      const cacheWriteTier = higherTier(model.pricing?.input_cache_write_tiers);
      return {
        model_id: model.id,
        label: model.name ?? model.id,
        provider_id: "vercel",
        input_price_per_1m: pricePerMillion(model.pricing?.input),
        output_price_per_1m: pricePerMillion(model.pricing?.output),
        cached_price_per_1m: pricePerMillion(model.pricing?.input_cache_read),
        cache_write_price_per_1m: pricePerMillion(model.pricing?.input_cache_write),
        context_window: model.context_window ?? null,
        context_window_source: "vercel_gateway",
        context_window_fetched_at: fetchedAt,
        context_window_is_fallback: false,
        max_output_tokens: model.max_tokens ?? null,
        supports_image_input:
          model.tags?.includes("vision") || model.tags?.includes("file-input"),
        supports_tool_calling: model.tags?.includes("tool-use"),
        supports_reasoning: model.tags?.includes("reasoning"),
        reasoning_options: parseReasoningOptions(model.reasoning_options),
        long_context_threshold: inputTier?.threshold ?? null,
        long_context_input_price_per_1m: inputTier?.pricePerMillion ?? null,
        long_context_output_price_per_1m: outputTier?.pricePerMillion ?? null,
        long_context_cached_price_per_1m: cacheReadTier?.pricePerMillion ?? null,
        long_context_cache_write_price_per_1m: cacheWriteTier?.pricePerMillion ?? null,
        client_avail: true,
        pinned_by_default: false,
        created_at:
          model.created == null
            ? fetchedAt
            : new Date(model.created * 1000).toISOString(),
        source: "vercel_gateway",
      };
    });

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, rows };
  return rows;
}
