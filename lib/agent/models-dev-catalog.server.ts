import "server-only";

import { readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";

import { z } from "zod";

import type { ModelCatalogEntry, ProviderCatalogMeta } from "@/lib/agent/model-catalog";
import {
  ensureOrionCacheDirectory,
  getModelsDevCatalogCacheFilePath,
} from "@/lib/local/orion-paths.server";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CATALOG_CREATED_AT = "2026-05-17T00:00:00.000Z";
const CACHE_VERSION = 1;
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;
const STALE_FALLBACK_MEMORY_TTL_MS = 5 * 60 * 1000;

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

const ModelCatalogEntryCacheSchema = z.object({
  model_id: z.string(),
  label: z.string(),
  provider_id: z.string(),
  api_model_id: z.string().optional(),
  input_price_per_1m: z.number().nullable(),
  output_price_per_1m: z.number().nullable(),
  cached_price_per_1m: z.number().nullable(),
  context_window: z.number().nullable(),
  max_output_tokens: z.number().nullable(),
  supports_image_input: z.boolean().optional(),
  supports_tool_calling: z.boolean().optional(),
  supports_forced_tool_choice: z.boolean().optional(),
  supports_reasoning: z.boolean().optional(),
  long_context_threshold: z.number().nullable(),
  long_context_input_price_per_1m: z.number().nullable(),
  long_context_output_price_per_1m: z.number().nullable(),
  client_avail: z.boolean(),
  pinned_by_default: z.boolean(),
  created_at: z.string(),
  source: z.literal("models_dev"),
});

const ProviderCatalogMetaCacheSchema = z.object({
  id: z.string(),
  label: z.string(),
  credentialKind: z.literal("api_key"),
  apiBaseUrl: z.string().optional(),
  source: z.literal("models_dev"),
});

const NormalizedModelsDevCatalogCacheSchema = z.object({
  version: z.literal(CACHE_VERSION),
  fetchedAt: z.string(),
  models: z.array(ModelCatalogEntryCacheSchema),
  providers: z.array(ProviderCatalogMetaCacheSchema),
});

type NormalizedModelsDevCatalog = {
  models: ModelsDevModelCatalogEntry[];
  providers: ModelsDevProviderCatalogMeta[];
};

type ModelsDevModelCatalogEntry = ModelCatalogEntry & { source: "models_dev" };
type ModelsDevProviderCatalogMeta = ProviderCatalogMeta & {
  credentialKind: "api_key";
  source: "models_dev";
};

type NormalizedModelsDevCatalogFile = z.infer<
  typeof NormalizedModelsDevCatalogCacheSchema
>;

let cache:
  | { expires: number; catalog: NormalizedModelsDevCatalog }
  | undefined;
let refreshPromise: Promise<NormalizedModelsDevCatalog> | undefined;

/** Converts raw models.dev JSON into Orion's compact catalog representation. */
function normalizeModelsDevCatalog(
  parsed: z.infer<typeof ModelsDevCatalogSchema>
): NormalizedModelsDevCatalog {
  return {
    models: Object.values(parsed).flatMap((provider) => {
      return Object.values(provider.models).map(
        (model): ModelsDevModelCatalogEntry => ({
          model_id: model.id,
          label: model.name,
          provider_id: provider.id,
          input_price_per_1m: model.cost?.input ?? null,
          output_price_per_1m: model.cost?.output ?? null,
          cached_price_per_1m: model.cost?.cache_read ?? null,
          context_window: model.limit?.context ?? null,
          max_output_tokens: model.limit?.output ?? null,
          supports_image_input:
            model.modalities?.input?.includes("image") ?? model.attachment,
          supports_tool_calling: model.tool_call,
          supports_reasoning: model.reasoning,
          long_context_threshold: null,
          long_context_input_price_per_1m: null,
          long_context_output_price_per_1m: null,
          client_avail: true,
          pinned_by_default: false,
          created_at: CATALOG_CREATED_AT,
          source: "models_dev",
        })
      );
    }),
    providers: Object.values(parsed).map((provider): ModelsDevProviderCatalogMeta => ({
      id: provider.id,
      label: provider.name ?? provider.id,
      credentialKind: "api_key",
      apiBaseUrl: provider.api,
      source: "models_dev",
    })),
  };
}

/** Loads the normalized on-disk models.dev cache when present and valid. */
async function readCatalogCacheFile(): Promise<
  { expires: number; catalog: NormalizedModelsDevCatalog } | undefined
> {
  try {
    const raw = await readFile(getModelsDevCatalogCacheFilePath(), "utf8");
    const file = NormalizedModelsDevCatalogCacheSchema.parse(JSON.parse(raw));
    const fetchedAt = Date.parse(file.fetchedAt);
    if (!Number.isFinite(fetchedAt)) return undefined;

    return {
      expires: fetchedAt + CATALOG_CACHE_TTL_MS,
      catalog: {
        models: file.models,
        providers: file.providers,
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

/** Persists the normalized models.dev catalog atomically under Orion's cache directory. */
async function writeCatalogCacheFile(
  catalog: NormalizedModelsDevCatalog
): Promise<void> {
  const directory = await ensureOrionCacheDirectory();
  const filePath = getModelsDevCatalogCacheFilePath();
  const tempPath = path.join(
    directory,
    `.models-dev-catalog.${process.pid}.${Date.now()}.tmp`
  );
  const payload: NormalizedModelsDevCatalogFile = {
    version: CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    models: catalog.models,
    providers: catalog.providers,
  };

  try {
    await writeFile(tempPath, `${JSON.stringify(payload)}\n`, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Fetches, validates, normalizes, and persists fresh models.dev metadata. */
async function refreshModelsDevCatalog(): Promise<NormalizedModelsDevCatalog> {
  const response = await fetch(MODELS_DEV_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`);

  const catalog = normalizeModelsDevCatalog(
    ModelsDevCatalogSchema.parse(await response.json())
  );
  await writeCatalogCacheFile(catalog).catch(() => undefined);
  cache = { expires: Date.now() + CATALOG_CACHE_TTL_MS, catalog };
  return catalog;
}

/** Returns normalized models.dev metadata using memory, file, live, and stale caches. */
async function fetchModelsDevCatalogData(): Promise<NormalizedModelsDevCatalog> {
  if (cache && cache.expires > Date.now()) return cache.catalog;

  const fileCache = await readCatalogCacheFile();
  if (fileCache && fileCache.expires > Date.now()) {
    cache = fileCache;
    return fileCache.catalog;
  }

  try {
    refreshPromise ??= refreshModelsDevCatalog().finally(() => {
      refreshPromise = undefined;
    });
    return await refreshPromise;
  } catch (error) {
    if (fileCache) {
      cache = {
        expires: Date.now() + STALE_FALLBACK_MEMORY_TTL_MS,
        catalog: fileCache.catalog,
      };
      return fileCache.catalog;
    }
    throw error;
  }
}

/** Fetch provider/model metadata from models.dev with Orion-managed caching. */
export async function fetchModelsDevCatalog(): Promise<ModelCatalogEntry[]> {
  return (await fetchModelsDevCatalogData()).models;
}

/** Fetch provider metadata from models.dev for the add-provider picker. */
export async function fetchModelsDevProviders(): Promise<ProviderCatalogMeta[]> {
  return (await fetchModelsDevCatalogData()).providers;
}
