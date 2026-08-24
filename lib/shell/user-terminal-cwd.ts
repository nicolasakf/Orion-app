import { toAgentAbsolutePath } from "@/lib/agent/path-resolver";
import type { UserTerminalWorkingDirectory } from "@/lib/settings/schema";

/**
 * Jupyter working directory for a user-created terminal.
 *
 * Prefers an absolute host path when the Jupyter root is known, because
 * jupyter_server_terminals only keeps `cwd` when that filesystem path exists.
 * Agent terminals never use this helper.
 */
export function resolveUserTerminalCwd(options: {
  preference: UserTerminalWorkingDirectory;
  workspaceDirectory?: string | null;
  rootDirectory?: string | null;
}): string | undefined {
  if (options.preference !== "workspace") {
    return undefined;
  }

  if (options.workspaceDirectory == null) {
    return undefined;
  }

  const absolutePath = toAgentAbsolutePath(options.workspaceDirectory, {
    rootDirectory: options.rootDirectory,
  });
  if (absolutePath) {
    return absolutePath;
  }

  const workspaceDirectory = options.workspaceDirectory.trim();
  return workspaceDirectory || undefined;
}
