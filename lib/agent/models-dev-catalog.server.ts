import "server-only";

import { z } from "zod";

import type { ModelCatalogEntry, ProviderCatalogMeta } from "@/lib/agent/model-catalog";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CATALOG_CREATED_AT = "2026-05-17T00:00:00.000Z";

const ModelsDevModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  attachment: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  cost: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      cache_read: z.number().optional(),
    })
    .optional(),
  limit: z
    .object({
      context: z.number().optional(),
      output: z.number().optional(),
    })
    .optional(),
  modalities: z
    .object({
      input: z.array(z.string()).optional(),
    })
    .optional(),
});

const ModelsDevProviderSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  api: z.string().optional(),
  models: z.record(ModelsDevModelSchema),
});

const ModelsDevCatalogSchema = z.record(ModelsDevProviderSchema);

let cache: { expires: number; rows: ModelCatalogEntry[] } | undefined;

/** Fetch provider/model metadata from models.dev with a short-lived in-memory cache. */
export async function fetchModelsDevCatalog(): Promise<ModelCatalogEntry[]> {
  if (cache && cache.expires > Date.now()) return cache.rows;

  const response = await fetch(MODELS_DEV_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`);

  const parsed = ModelsDevCatalogSchema.parse(await response.json());
  const rows = Object.values(parsed).flatMap((provider) => {
    return Object.values(provider.models).map((model): ModelCatalogEntry => ({
      model_id: model.id,
      label: model.name,
      provider_id: provider.id,
      input_price_per_1m: model.cost?.input ?? null,
      output_price_per_1m: model.cost?.output ?? null,
      cached_price_per_1m: model.cost?.cache_read ?? null,
      context_window: model.limit?.context ?? null,
      max_output_tokens: model.limit?.output ?? null,
      supports_image_input: model.modalities?.input?.includes("image") ?? model.attachment,
      supports_tool_calling: model.tool_call,
      supports_reasoning: model.reasoning,
      long_context_threshold: null,
      long_context_input_price_per_1m: null,
      long_context_output_price_per_1m: null,
      client_avail: true,
      pinned_by_default: false,
      created_at: CATALOG_CREATED_AT,
      source: "models_dev",
    }));
  });

  cache = { expires: Date.now() + 60 * 60 * 1000, rows };
  return rows;
}

/** Fetch provider metadata from models.dev for the add-provider picker. */
export async function fetchModelsDevProviders(): Promise<ProviderCatalogMeta[]> {
  const response = await fetch(MODELS_DEV_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`);

  const parsed = ModelsDevCatalogSchema.parse(await response.json());
  return Object.values(parsed).map((provider) => ({
    id: provider.id,
    label: provider.name ?? provider.id,
    credentialKind: "api_key",
    apiBaseUrl: provider.api,
    source: "models_dev",
  }));
}
