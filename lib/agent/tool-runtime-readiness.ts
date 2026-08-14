import type { OrionToolName } from "@/lib/agent/tool-schemas";
import { NO_DEPENDENCY_TOOLS, SERVER_ONLY_TOOLS } from "@/lib/agent/tool-schemas";
import type { KernelStatus } from "@/lib/types";

export type MissingToolRuntimeDependency = "server" | "kernel";

/**
 * Returns the unavailable runtime dependency that prevents a tool from running.
 *
 * Server-only tools still work without a running kernel, but only after the
 * Jupyter server has passed a connection check.
 */
export function getMissingToolRuntimeDependency(
  toolName: OrionToolName,
  options: {
    serverReady: boolean;
    kernelStatus: KernelStatus;
  }
): MissingToolRuntimeDependency | null {
  if (NO_DEPENDENCY_TOOLS.has(toolName)) return null;
  if (!options.serverReady) return "server";
  if (!SERVER_ONLY_TOOLS.has(toolName) && options.kernelStatus !== "connected") {
    return "kernel";
  }
  return null;
}
