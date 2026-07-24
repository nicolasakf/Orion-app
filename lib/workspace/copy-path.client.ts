import { toAgentAbsolutePath } from "@/lib/agent/path-resolver";

export interface CopiedWorkspacePath {
  /** The value written to the clipboard. */
  path: string;
  /** Whether the copied value is an absolute path on the Jupyter host. */
  isAbsolute: boolean;
}

/**
 * Resolves a Jupyter-relative path to its absolute host path when Orion knows
 * the active Jupyter root. Remote and manually configured servers do not
 * expose that root, so their relative path remains the safe fallback.
 */
export function resolveWorkspaceCopyPath(
  path: string,
  rootDirectory?: string | null,
): CopiedWorkspacePath {
  const absolutePath = toAgentAbsolutePath(path, { rootDirectory });
  return {
    path: absolutePath ?? path,
    isAbsolute: absolutePath !== null,
  };
}

/**
 * Copies a workspace path through the browser clipboard.
 *
 * Callers own user feedback because the appropriate toast location differs
 * between the file tree, business workspace, and editor fallback flows.
 */
export async function copyWorkspacePath(
  path: string,
  rootDirectory?: string | null,
): Promise<CopiedWorkspacePath> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }

  const copiedPath = resolveWorkspaceCopyPath(path, rootDirectory);
  await navigator.clipboard.writeText(copiedPath.path);
  return copiedPath;
}
