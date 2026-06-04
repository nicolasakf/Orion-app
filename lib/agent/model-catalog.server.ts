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

/** Return the snapshot catalog merged with best-effort live models.dev data. */
export async function getMergedModelCatalog(): Promise<ModelCatalogEntry[]> {
  const live = await fetchModelsDevCatalog().catch(() => []);
  return mergeModelCatalog(CLIENT_MODEL_CATALOG, live);
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
