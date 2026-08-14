import type { ModelCatalogEntry } from "@/lib/agent/model-catalog";

/** Merge catalog rows by provider/model, with later sources overriding earlier rows. */
export function mergeModelCatalog(
  ...sources: Array<ReadonlyArray<ModelCatalogEntry> | undefined>
): ModelCatalogEntry[] {
  const rows = new Map<string, ModelCatalogEntry>();

  for (const source of sources) {
    for (const row of source ?? []) {
      const key = `${row.provider_id}/${row.model_id}`;
      const previous = rows.get(key);
      const merged = {
        ...previous,
        ...row,
      };
      if (row.reasoning_options === undefined && previous?.reasoning_options !== undefined) {
        merged.reasoning_options = previous.reasoning_options;
      }
      rows.set(key, merged);
    }
  }

  return Array.from(rows.values());
}
