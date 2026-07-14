/**
 * Copies a Jupyter-relative workspace path through the browser clipboard.
 *
 * Callers own user feedback because the appropriate toast location differs
 * between the file tree, business workspace, and editor fallback flows.
 */
export async function copyWorkspacePath(path: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }

  await navigator.clipboard.writeText(path);
}
