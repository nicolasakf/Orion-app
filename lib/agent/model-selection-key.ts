import { isKnownProvider } from "@/lib/agent/model-catalog";

/** Composite pin/selection key: `providerId/modelId` (first `/` separates provider). */
export function formatModelSelectionKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

/**
 * Parses a composite selection key, or returns null for legacy bare model ids.
 *
 * Some APIs use upstream-style ids with slashes (Vercel AI Gateway:
 * `moonshotai/kimi-k2.5`, `openai/gpt-oss-120b`; Groq: `qwen/qwen3-32b`). Those
 * are not `orionProvider/modelId` keys — only treat a key as composite when the
 * prefix is a known Orion provider id (e.g. `vercel/moonshotai/kimi-k2.5`).
 */
export function parseModelSelectionKey(
  key: string
): { providerId: string; modelId: string } | null {
  const slash = key.indexOf("/");
  if (slash <= 0) return null;
  const providerId = key.slice(0, slash);
  const modelId = key.slice(slash + 1);
  if (!providerId || !modelId || !isKnownProvider(providerId)) return null;
  return { providerId, modelId };
}

export interface ModelSelectionLookupRow {
  value: string;
  provider: string;
}

/** Resolves a catalog row by composite pin key, falling back to legacy bare model id. */
export function findModelBySelectionKey<T extends ModelSelectionLookupRow>(
  models: readonly T[],
  key: string
): T | undefined {
  const exactComposite = models.find(
    (model) => formatModelSelectionKey(model.provider, model.value) === key
  );
  if (exactComposite) return exactComposite;

  const parsed = parseModelSelectionKey(key);
  if (parsed) {
    const byComposite = models.find(
      (model) => model.provider === parsed.providerId && model.value === parsed.modelId
    );
    if (byComposite) return byComposite;
  }
  return models.find((model) => model.value === key);
}

/** Catalog `model_id` to send to chat APIs (never the composite selection key). */
export function resolveCatalogModelIdForApi(
  selectionKey: string,
  model?: ModelSelectionLookupRow
): string {
  if (model) return model.value;
  return parseModelSelectionKey(selectionKey)?.modelId ?? selectionKey;
}

interface CatalogRowForPinNormalization {
  model_id: string;
  provider_id: string;
}

/**
 * Upgrades legacy bare `model_id` pins to composite keys when the catalog has
 * exactly one matching provider.
 */
export function normalizePinnedModelKey(
  key: string,
  catalogRows: readonly CatalogRowForPinNormalization[]
): string {
  if (parseModelSelectionKey(key)) return key;

  const matches = catalogRows.filter((row) => row.model_id === key);
  if (matches.length === 1) {
    return formatModelSelectionKey(matches[0].provider_id, key);
  }
  return key;
}

/** Normalizes an ordered list of pinned model keys from user settings. */
export function normalizePinnedModelKeys(
  keys: readonly string[],
  catalogRows: readonly CatalogRowForPinNormalization[]
): string[] {
  return keys.map((key) => normalizePinnedModelKey(key, catalogRows));
}
