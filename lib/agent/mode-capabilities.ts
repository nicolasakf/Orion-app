/**
 * Interaction-mode capability resolution for prompt building.
 *
 * Mode prompts used to hardcode capability claims ("you cannot modify files")
 * per base mode, while the tool list and bash policy of every mode — including
 * the built-ins — stay editable in settings. That let a mode advertise
 * `edit_file` while its prompt insisted files could not be modified.
 *
 * Capabilities are therefore derived from the tool names actually sent with the
 * request, so the prompt can only ever describe the tools the model really has.
 */

import type { InteractionModeBashPolicy } from "@/lib/agent/interaction-modes";
import {
  ASK_MODE_TOOLS,
  EDIT_MODE_TOOLS,
  ORION_TOOL_NAMES,
  type OrionToolName,
} from "@/lib/agent/tool-schemas";

/** What a resolved interaction mode actually lets the model do. */
export interface ModeToolCapabilities {
  /** `use_notebook` is available, so the model can connect or create notebooks. */
  canConnectNotebook: boolean;
  /** At least one notebook cell mutation tool is available. */
  canEditNotebookCells: boolean;
  /** Notebook cell or kernel execution is available. */
  canExecuteCode: boolean;
  /** `edit_file` is available. */
  canEditFiles: boolean;
  /** `bash` is available. */
  canRunShell: boolean;
  /** Shell policy enforced at execution time for `bash`. */
  bashPolicy: InteractionModeBashPolicy;
}

/** Default tool names assumed for a base mode when a caller passes none. */
const DEFAULT_TOOL_NAMES_BY_BASE_MODE = {
  Agent: ORION_TOOL_NAMES,
  Research: ORION_TOOL_NAMES,
  Edit: Object.keys(EDIT_MODE_TOOLS) as OrionToolName[],
  Ask: Object.keys(ASK_MODE_TOOLS) as OrionToolName[],
} as const;

/** Base modes that map to a protected base prompt and a default tool set. */
export type CapabilityBaseMode = keyof typeof DEFAULT_TOOL_NAMES_BY_BASE_MODE;

const NOTEBOOK_CELL_EDIT_TOOLS: readonly OrionToolName[] = [
  "insert_cell",
  "overwrite_cell_source",
  "delete_cell",
  "edit_orion_metadata",
];

const EXECUTION_TOOLS: readonly OrionToolName[] = [
  "execute_cell",
  "execute_code",
  "restart_notebook",
];

/**
 * Resolves the capabilities a prompt may claim, from the mode's real tool list.
 *
 * @param baseMode - Base mode used to pick default tool names and bash policy
 * @param toolNames - Resolved mode tool names; omit to use the base-mode defaults
 * @param bashPolicy - Resolved bash policy; omit to use the base-mode default
 */
export function resolveModeToolCapabilities(options: {
  baseMode: CapabilityBaseMode;
  toolNames?: readonly OrionToolName[];
  bashPolicy?: InteractionModeBashPolicy;
}): ModeToolCapabilities {
  const { baseMode, toolNames, bashPolicy } = options;
  const resolvedToolNames = new Set<OrionToolName>(
    toolNames ?? DEFAULT_TOOL_NAMES_BY_BASE_MODE[baseMode]
  );

  return {
    canConnectNotebook: resolvedToolNames.has("use_notebook"),
    canEditNotebookCells: NOTEBOOK_CELL_EDIT_TOOLS.some((name) => resolvedToolNames.has(name)),
    canExecuteCode: EXECUTION_TOOLS.some((name) => resolvedToolNames.has(name)),
    canEditFiles: resolvedToolNames.has("edit_file"),
    canRunShell: resolvedToolNames.has("bash"),
    bashPolicy: bashPolicy ?? (baseMode === "Ask" ? "read_only" : "full"),
  };
}

/**
 * Builds the `## Tool Access` section describing every restriction in force.
 *
 * Returns an empty string when the mode is unrestricted, so a full Agent prompt
 * carries no redundant "you can do everything" paragraph.
 */
export function buildModeToolAccessSection(capabilities: ModeToolCapabilities): string {
  const restrictions: string[] = [];

  if (!capabilities.canExecuteCode) {
    restrictions.push(
      "- **No code execution.** You cannot run notebook cells or kernel code. When a task needs execution, write the code out and tell the user exactly where and how to run it."
    );
  }

  if (!capabilities.canEditNotebookCells) {
    restrictions.push(
      "- **No notebook edits.** You cannot add, change, or delete notebook cells or their Orion metadata. Propose the cell content instead."
    );
  }

  if (!capabilities.canConnectNotebook) {
    restrictions.push(
      "- **No notebook connection.** `use_notebook` is unavailable, so you cannot connect to or create notebooks. Cell-level notebook tools act only on the notebook already connected in the UI."
    );
  }

  if (!capabilities.canEditFiles) {
    restrictions.push(
      "- **No file writes.** You cannot create or modify files. Show the intended content or diff and let the user apply it."
    );
  }

  if (capabilities.canRunShell && capabilities.bashPolicy === "read_only") {
    restrictions.push(
      "- **Read-only shell.** `bash` runs only non-mutating commands. Commands that write, move, copy, delete, install packages, change permissions, commit to git, or redirect output into a file are blocked before they run, so do not plan work that depends on them."
    );
  }

  if (!capabilities.canRunShell) {
    restrictions.push(
      "- **No shell.** `bash` is unavailable; use the read and notebook tools you were given instead."
    );
  }

  if (restrictions.length === 0) return "";

  return `## Tool Access

Only the tools supplied with this request are callable, and this mode withholds some of them. Do not announce or attempt work that needs a tool you were not given — say what is out of scope for this mode and offer the closest thing you can do.

${restrictions.join("\n")}`;
}
