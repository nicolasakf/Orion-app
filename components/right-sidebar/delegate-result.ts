/** Helpers for rendering structured delegate tool output. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns the human-facing delegate summary. Older delegate outputs were plain
 * strings; newer outputs are structured so the model can reconnect by path.
 */
export function delegateResultToDisplayText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (isRecord(result) && typeof result.summary === "string") {
    return result.summary;
  }
  return JSON.stringify(result, null, 2) ?? String(result);
}

/** Extracts the tmp notebook path from a structured delegate result. */
export function delegateResultTmpNotebookPath(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  return typeof result.tmpNotebookPath === "string" && result.tmpNotebookPath.length > 0
    ? result.tmpNotebookPath
    : undefined;
}
