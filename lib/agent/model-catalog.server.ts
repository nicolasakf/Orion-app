import "server-only";

import {
  CLIENT_MODEL_CATALOG,
  getProviderCatalogMeta,
  type ModelCatalogEntry,
  type ProviderCatalogMeta,
} from "@/lib/agent/model-catalog";
import { mergeModelCatalog } from "@/lib/agent/model-catalog-merge";
import { fetchModelsDevCatalog, fetchModelsDevProviders } from "@/lib/agent/models-dev-catalog.server";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import { fetchVercelGatewayCatalog } from "@/lib/agent/vercel-gateway-catalog.server";
import { UNKNOWN_CONTEXT_FALLBACK_TOKENS } from "@/lib/agent/token-budget";

/** Return the snapshot catalog merged with best-effort live models.dev data. */
export async function getMergedModelCatalog(): Promise<ModelCatalogEntry[]> {
  const live = await fetchModelsDevCatalog().catch(() => []);
  const vercel = await fetchVercelGatewayCatalog().catch(() => []);
  return mergeModelCatalog(CLIENT_MODEL_CATALOG, live, vercel).map((model) => {
    let resolved = model;
    if (model.provider_id === "vercel" && model.source !== "vercel_gateway") {
      const [nativeProviderId, ...nativeModelParts] = model.model_id.split("/");
      const nativeModelId = nativeModelParts.join("/");
      const modelsDevFallback = live.find((candidate) =>
        candidate.provider_id === nativeProviderId &&
        (candidate.model_id === nativeModelId || candidate.model_id === model.model_id)
      );
      if (modelsDevFallback) {
        resolved = {
          ...model,
          ...modelsDevFallback,
          provider_id: "vercel",
          model_id: model.model_id,
          client_avail: model.client_avail,
          pinned_by_default: model.pinned_by_default,
          source: "models_dev",
          context_window_source: "models_dev",
        };
      }
    }
    const contextWindowIsFallback = resolved.context_window == null;
    return {
      ...resolved,
      context_window: resolved.context_window ?? UNKNOWN_CONTEXT_FALLBACK_TOKENS,
      context_window_source:
        contextWindowIsFallback
          ? "fallback"
          : (resolved.context_window_source ?? resolved.source ?? "snapshot"),
      context_window_fetched_at:
        resolved.context_window_fetched_at ?? resolved.created_at,
      context_window_is_fallback: contextWindowIsFallback,
    };
  });
}

/** Look up a merged catalog row by provider and selectable model id. */
export async function getMergedModelCatalogEntry(
  providerId: ProviderId,
  modelId: string
): Promise<ModelCatalogEntry | undefined> {
  return (await getMergedModelCatalog()).find(
    (model) => model.provider_id === providerId && model.model_id === modelId
  );
}

/** Return built-in provider metadata merged with best-effort models.dev providers. */
export async function getMergedProviderCatalog(): Promise<ProviderCatalogMeta[]> {
  const providers = new Map<string, ProviderCatalogMeta>();
  for (const provider of getProviderCatalogMeta()) providers.set(provider.id, provider);
  for (const provider of await fetchModelsDevProviders().catch(() => [])) {
    const existing = providers.get(provider.id);
    providers.set(provider.id, {
      ...provider,
      ...existing,
      label: existing?.label ?? provider.label,
      apiBaseUrl: existing?.apiBaseUrl ?? provider.apiBaseUrl,
    });
  }
  return Array.from(providers.values()).sort((a, b) => a.label.localeCompare(b.label));
}
