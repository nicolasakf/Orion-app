import type { NotebookOutputType } from "@/lib/types";
import { getDefaultMimeRegistry } from "@/lib/notebook/mime-registry";

/** Character threshold above which text outputs are auto-collapsed on first render. */
export const TEXT_OUTPUT_AUTO_COLLAPSE_THRESHOLD = 2000;

/**
 * Returns persisted per-output collapse state from output metadata, if set.
 * Undefined means no explicit user preference has been saved yet.
 */
export function getOutputPersistedCollapsed(
  output: NotebookOutputType,
): boolean | undefined {
  const isCollapsed = output.metadata?.orion?.isCollapsed;
  if (isCollapsed === true || isCollapsed === false) {
    return isCollapsed;
  }
  return undefined;
}

/**
 * Returns the approximate rendered text character length for an output.
 * Returns 0 for non-text outputs (images, plotly, tables).
 */
export function getOutputTextLength(output: NotebookOutputType): number {
  const mimeRegistry = getDefaultMimeRegistry();
  return mimeRegistry.getTextLength(output);
}
