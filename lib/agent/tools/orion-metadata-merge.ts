/**
 * Helpers for merging model-provided JSON into cell metadata.orion.
 */

import { CellOrionMetadataSchema, isJsonObjectValue } from "./edit-orion-metadata-schema";
import type { NotebookCell } from "./types";

type JsonObject = Record<string, unknown>;

/** Returns a JSON-safe deep clone of a metadata object. */
function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

/** Recursively merges object fields, replacing arrays and scalars. */
function deepMerge(base: JsonObject, patch: JsonObject): JsonObject {
  const out = cloneJsonObject(base);
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    if (isJsonObjectValue(existing) && isJsonObjectValue(value)) {
      out[key] = deepMerge(existing, value);
    } else if (isJsonObjectValue(value)) {
      out[key] = cloneJsonObject(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Formats schema validation issues for model-facing tool errors. */
function formatMetadataError(
  prefix: string,
  issues: Array<{ path: Array<string | number>; message: string }>,
): string {
  const details = issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  return `[ERROR] ${prefix}: ${details}`;
}

/**
 * Merge a JSON object into a cell's metadata.orion object.
 *
 * Empty strings are treated as no-op. The protected Orion cell id is preserved,
 * and the final metadata.orion object is validated against the supported cell
 * metadata contract.
 */
export function mergeCellOrionMetadataJson(
  cell: NotebookCell,
  orionMetadataJson: string,
  label: string,
): string | null {
  const trimmed = orionMetadataJson.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `[ERROR] ${label}: orionMetadataJson is not valid JSON: ${message}`;
  }

  if (!isJsonObjectValue(parsed)) {
    return `[ERROR] ${label}: orionMetadataJson must parse to a JSON object. Use an empty string "" when no Orion metadata merge is needed.`;
  }

  const existingOrion = isJsonObjectValue(cell.metadata?.orion)
    ? cell.metadata.orion
    : {};
  const existingId = typeof existingOrion.id === "string" ? existingOrion.id : null;
  if (
    existingId &&
    Object.prototype.hasOwnProperty.call(parsed, "id") &&
    parsed.id !== existingId
  ) {
    return `[ERROR] ${label}: orionMetadataJson cannot change protected cell metadata.orion.id '${existingId}'.`;
  }

  const nextOrion = deepMerge(existingOrion, parsed);
  if (existingId) {
    nextOrion.id = existingId;
  }

  const validation = CellOrionMetadataSchema.safeParse(nextOrion);
  if (!validation.success) {
    return formatMetadataError(`${label}: cell metadata.orion is invalid`, validation.error.issues);
  }

  cell.metadata = {
    ...(cell.metadata ?? {}),
    orion: nextOrion,
  };

  return null;
}
