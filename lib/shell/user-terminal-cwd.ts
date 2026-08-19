import type { UserTerminalWorkingDirectory } from "@/lib/settings/schema";

/**
 * Jupyter-relative working directory for a user-created terminal.
 *
 * Agent terminals never use this helper. An unset or empty workspace falls
 * back to Jupyter's default (`~/` when the server root is the home directory).
 */
export function resolveUserTerminalCwd(options: {
  preference: UserTerminalWorkingDirectory;
  workspaceDirectory?: string | null;
}): string | undefined {
  if (options.preference !== "workspace") {
    return undefined;
  }

  const workspaceDirectory = options.workspaceDirectory?.trim();
  return workspaceDirectory || undefined;
}
