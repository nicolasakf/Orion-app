import type { ModelCatalogEntry } from "@/lib/agent/model-catalog";

/** Merge catalog rows by provider/model, with later sources overriding earlier rows. */
export function mergeModelCatalog(
  ...sources: Array<ReadonlyArray<ModelCatalogEntry> | undefined>
): ModelCatalogEntry[] {
  const rows = new Map<string, ModelCatalogEntry>();

  for (const source of sources) {
    for (const row of source ?? []) {
      rows.set(`${row.provider_id}/${row.model_id}`, {
        ...rows.get(`${row.provider_id}/${row.model_id}`),
        ...row,
      });
    }
  }

  return Array.from(rows.values());
}
