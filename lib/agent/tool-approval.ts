import type { OrionToolName } from "@/lib/agent/tool-schemas";
import type { ToolApprovalMode } from "@/lib/settings/schema";

/** Tools that can cause irreversible changes and require user approval in "always_ask" mode. */
export const DANGEROUS_TOOLS: Set<OrionToolName> = new Set([
  "execute_cell",
  "execute_code",
  "bash",
  "insert_cell",
  "delete_cell",
  "overwrite_cell_source",
  "edit_orion_metadata",
  "restart_notebook",
  "edit_file",
]);

/** Returns true if the given tool requires user approval before execution. */
export function needsApproval(toolName: OrionToolName, mode: ToolApprovalMode): boolean {
  if (mode === "auto_run") return false;
  return DANGEROUS_TOOLS.has(toolName);
}
