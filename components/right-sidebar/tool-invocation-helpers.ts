/**
 * tool-invocation-helpers.ts
 *
 * Pure helper functions, types, and metadata for ToolInvocationCard.
 * Extracted to keep the component file focused on rendering.
 */

import {
  Terminal,
  FileText,
  Play,
  Code2,
  BookOpen,
  RefreshCw,
  Trash2,
  PenLine,
  Plus,
  Server,
  Eye,
  Unplug,
  Notebook,
  Brain,
  Bot,
  Hourglass,
  Globe,
  Search,
} from "lucide-react";
import type { OrionToolName } from "@/lib/agent/tool-schemas";

// ============================================================================
// Safe args access
// ============================================================================

/** Normalise `args` so every consumer gets a guaranteed object (never undefined). */
export function safeArgs(
  args: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  return args ?? {};
}

// ============================================================================
// Primitive extractors
// ============================================================================

export function argStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function argNum(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

// ============================================================================
// String formatting helpers
// ============================================================================

/**
 * For long commands, show only the first word of each &&-separated part.
 * e.g. "find . -type f -name '*.csv'" → "find"
 * e.g. "ls -a && ls -l" → "ls && ls"
 */
export function getCommandDisplay(command: string, maxLength = 40): string {
  const trimmed = command.trim();
  if (trimmed.length <= maxLength) return command;

  const parts = trimmed
    .split("&&")
    .map((p) => p.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
  return parts.join(" && ");
}

/** Truncate a string for preview, optionally with ellipsis. */
export function truncateForPreview(text: string, maxLen = 120): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + "…";
}

/** Format cell index lists for display */
export function formatIndexList(indices: number[]): string {
  if (indices.length === 0) return "";
  if (indices.length <= 5) return indices.join(", ");
  return `${indices.slice(0, 3).join(", ")} … +${indices.length - 3} more`;
}

function lineCountText(s: string): number {
  if (!s) return 0;
  return s.split("\n").length;
}

// ============================================================================
// Args preview types
// ============================================================================

/** Human-readable summary of tool arguments for expanded cards and approval UI. */
export type ToolInvocationArgsPreview = {
  short: string;
  /** Full text when short is truncated (ellipsis popover) */
  full?: string;
  /** Shown before `short` (e.g. shell prompt for terminal commands) */
  prefix?: string;
};

// ============================================================================
// Tool metadata
// ============================================================================

export type ToolMeta = {
  /** Present continuous — shown while the tool is in-flight or awaiting approval */
  labelPending: string;
  /** Past tense — shown after the tool finishes (success, error, or warning) */
  labelDone: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const TOOL_META: Record<OrionToolName, ToolMeta> = {
  list_kernels: { labelPending: "Listing kernels", labelDone: "Listed kernels", icon: Server },
  shutdown_kernel: { labelPending: "Shutting down kernels", labelDone: "Shut down kernels", icon: Unplug },
  use_notebook: { labelPending: "Connecting notebook", labelDone: "Connected notebook", icon: BookOpen },
  read_notebook: { labelPending: "Reading notebook", labelDone: "Read notebook", icon: Notebook },
  restart_notebook: { labelPending: "Restarting kernel", labelDone: "Restarted kernel", icon: RefreshCw },
  read_cell: { labelPending: "Reading cell", labelDone: "Read cell", icon: Code2 },
  insert_cell: { labelPending: "Inserting cells", labelDone: "Inserted cells", icon: Plus },
  delete_cell: { labelPending: "Deleting cells", labelDone: "Deleted cells", icon: Trash2 },
  overwrite_cell_source: { labelPending: "Editing cell", labelDone: "Edited cell", icon: PenLine },
  edit_orion_metadata: { labelPending: "Editing metadata", labelDone: "Edited metadata", icon: PenLine },
  execute_cell: { labelPending: "Executing cells", labelDone: "Executed cells", icon: Play },
  execute_code: { labelPending: "Executing code", labelDone: "Executed code", icon: Terminal },
  bash: { labelPending: "Running command", labelDone: "Ran command", icon: Terminal },
  await_command: { labelPending: "Awaiting command", labelDone: "Awaited command", icon: Hourglass },
  read_file: { labelPending: "Reading file", labelDone: "Read file", icon: FileText },
  edit_file: { labelPending: "Editing file", labelDone: "Edited file", icon: PenLine },
  update_memory: { labelPending: "Updating memory", labelDone: "Updated memory", icon: Brain },
  reload_page: { labelPending: "Reloading page", labelDone: "Reloaded page", icon: RefreshCw },
  web_fetch: { labelPending: "Fetching web page", labelDone: "Fetched web page", icon: Globe },
  web_search: { labelPending: "Searching web", labelDone: "Searched web", icon: Search },
  read_cell_output: { labelPending: "Reading output", labelDone: "Read output", icon: Eye },
  inspect_plotly_output: { labelPending: "Inspecting Plotly output", labelDone: "Inspected Plotly output", icon: Eye },
  load_skill: { labelPending: "Loading skill", labelDone: "Loaded skill", icon: Brain },
  delegate: { labelPending: "Running sub-agent", labelDone: "Sub-agent finished", icon: Bot },
};

/** Fallback for unknown tool names */
export function getToolMeta(toolName: OrionToolName): ToolMeta {
  return TOOL_META[toolName] ?? { labelPending: toolName, labelDone: toolName, icon: Terminal };
}

/**
 * Convert a list of tool names being executed by a sub-agent step into a
 * short human-readable description shown in the DelegateInvocationCard.
 *
 * - Empty array (model is thinking): returns "Thinking..."
 * - Non-empty (tools about to run): returns deduplicated pending labels joined by " · "
 */
export function getSubagentStepDescription(step: number, tools: OrionToolName[]): string {
  if (tools.length === 0) return "Thinking...";
  const labels = tools.map((t) => TOOL_META[t]?.labelPending ?? t);
  // Deduplicate while preserving order
  const unique = labels.filter((l, i) => labels.indexOf(l) === i);
  return unique.join(" · ");
}

// ============================================================================
// Tool label resolution
// ============================================================================

/** Which tools show a cell-count label like "Reading 3 cells" */
const CELL_COUNT_LABEL_TOOLS = new Set<OrionToolName>([
  "read_cell",
  "read_cell_output",
  "execute_cell",
  "insert_cell",
  "delete_cell",
  "overwrite_cell_source",
]);

function getCellOpCount(toolName: OrionToolName, args: Record<string, unknown>): number {
  switch (toolName) {
    case "read_cell": {
      const ix = Array.isArray(args.cellIndices) ? (args.cellIndices as number[]) : [];
      return Math.max(ix.length, 1);
    }
    case "read_cell_output": {
      const reads = Array.isArray(args.reads) ? args.reads : [];
      return Math.max(reads.length, 1);
    }
    case "overwrite_cell_source": {
      const cells = Array.isArray(args.cells) ? args.cells : [];
      return Math.max(cells.length, 1);
    }
    case "execute_cell":
    case "delete_cell": {
      const ix = Array.isArray(args.cellIndices) ? (args.cellIndices as number[]) : [];
      return Math.max(ix.length, 1);
    }
    case "insert_cell": {
      const cells = Array.isArray(args.cells) ? args.cells : [];
      return Math.max(cells.length, 1);
    }
    default:
      return 1;
  }
}

/** Runtime row label for cell tools ("Reading N cells", …). Returns null for non-cell tools. */
function getCellToolRuntimeLabel(
  toolName: OrionToolName,
  args: Record<string, unknown>,
  isPending: boolean
): string | null {
  if (!CELL_COUNT_LABEL_TOOLS.has(toolName)) return null;
  const n = getCellOpCount(toolName, args);
  const cells = n === 1 ? "1 cell" : `${n} cells`;

  const labels: Record<string, [string, string]> = {
    read_cell: [`Reading ${cells}`, `Read ${cells}`],
    read_cell_output: [`Reading output (${cells})`, `Read ${cells} output`],
    execute_cell: [`Running ${cells}`, `Ran ${cells}`],
    insert_cell: [`Inserting ${cells}`, `Inserted ${cells}`],
    delete_cell: [`Deleting ${cells}`, `Deleted ${cells}`],
    overwrite_cell_source: [`Editing ${cells}`, `Edited ${cells}`],
  };
  const pair = labels[toolName];
  return pair ? pair[isPending ? 0 : 1] : null;
}

/**
 * Resolve the human-readable label for the tool row.
 * Uses early returns instead of nested ternaries for readability.
 */
export function getToolLabel(
  toolName: OrionToolName,
  args: Record<string, unknown>,
  isPending: boolean,
  meta: ToolMeta,
  leadingText: string | null,
  isError: boolean
): string {
  // use_notebook: label depends on args.mode
  if (toolName === "use_notebook") {
    const mode = args.mode;
    if (mode === "create") return isPending ? "Creating notebook" : "Created notebook";
    if (mode === "connect") return isPending ? "Connecting notebook" : "Connected notebook";
    return isPending ? meta.labelPending : meta.labelDone;
  }

  // Cell tools: "Reading 3 cells", etc.
  const cellLabel = getCellToolRuntimeLabel(toolName, args, isPending);
  if (cellLabel != null) return cellLabel;

  // Default: pending/done from TOOL_META
  return isPending ? meta.labelPending : meta.labelDone;
}

// ============================================================================
// Expanded args preview
// ============================================================================

/** When expanded, only these tools show the args summary row above the output */
const TOOLS_WITH_EXPANDED_ARGS_PREVIEW = new Set<OrionToolName>([
  "bash",
  "await_command",
  "execute_code",
  "read_cell",
  "read_cell_output",
  "inspect_plotly_output",
  "execute_cell",
  "insert_cell",
  "overwrite_cell_source",
  "edit_orion_metadata",
  "delete_cell",
  "read_notebook",
  "read_file",
  "edit_file",
  "web_fetch",
  "web_search",
  "load_skill",
]);

/** Expanded preview: filename + line delta from tool result when possible, else from args. */
function buildEditFileExpandedPreview(
  args: Record<string, unknown>,
  leadingText: string | null,
  isError: boolean
): ToolInvocationArgsPreview {
  const filePath = argStr(args.filePath);
  if (!isError && leadingText && !leadingText.startsWith("[ERROR")) {
    const wrote = leadingText.match(/^Successfully wrote .+ \((\d+) lines\)\./);
    if (wrote) return { short: `${filePath}: wrote ${wrote[1]} lines` };

    const edited = leadingText.match(
      /^Successfully edited '([^']+)': replaced (\d+)-line block with (\d+)-line block\./
    );
    if (edited) {
      const [, path, removed, added] = edited;
      return { short: `${path}: +${added} / −${removed} lines` };
    }
  }

  const mode = args.mode === "overwrite" || args.mode === "replace" ? args.mode : null;
  if (mode === "replace") {
    const rm = lineCountText(argStr(args.oldString));
    const ad = lineCountText(argStr(args.newString));
    return { short: `${filePath}: +${ad} / −${rm} lines` };
  }
  if (mode === "overwrite") {
    const n = lineCountText(argStr(args.content));
    return { short: `${filePath}: ${n} lines (overwrite)` };
  }
  return { short: `${filePath}: edit` };
}

/** Approval-time edit summary (lines only, no file bodies). */
function buildEditFileApprovalPreview(args: Record<string, unknown>): ToolInvocationArgsPreview {
  return buildEditFileExpandedPreview(args, null, true);
}

/** Args summary for Orion metadata edits. */
function buildEditOrionMetadataPreview(args: Record<string, unknown>): ToolInvocationArgsPreview {
  const edits = Array.isArray(args.edits)
    ? (args.edits as Array<{
        target?: unknown;
        cellIndex?: unknown;
        operation?: unknown;
        path?: unknown;
        valueJson?: unknown;
      }>)
    : [];
  if (edits.length === 0) return { short: "Edit Orion metadata" };

  const first = edits[0]!;
  const target = first.target === "cell"
    ? `cell ${argNum(first.cellIndex) ?? "?"}`
    : "notebook";
  const operation = typeof first.operation === "string" ? first.operation : "edit";
  const path = Array.isArray(first.path)
    ? (first.path as unknown[]).filter((part): part is string => typeof part === "string").join(".")
    : "";
  const fullPath = path ? `metadata.orion.${path}` : "metadata.orion";
  const suffix = edits.length > 1 ? ` (+${edits.length - 1} more)` : "";
  return { short: `${operation} ${target} ${fullPath}${suffix}` };
}

/** Args row shown when the user expands a finished tool (subset of tools only). */
export function buildExpandedArgsPreview(
  toolName: OrionToolName,
  args: Record<string, unknown>,
  leadingText: string | null,
  isError: boolean
): ToolInvocationArgsPreview | null {
  if (!TOOLS_WITH_EXPANDED_ARGS_PREVIEW.has(toolName)) return null;

  switch (toolName) {
    case "bash": {
      const cmd = argStr(args.command);
      const term = argStr(args.terminalName);
      const background = args.background === true;
      if (!cmd.trim()) {
        return { short: term ? `Terminal "${term}"` : "Run command", prefix: "$ " };
      }
      const shown = getCommandDisplay(cmd);
      const trimmed = cmd.trim();
      const base =
        term || background
          ? `${term ? `[${term}] ` : ""}${shown}${background ? " (background)" : ""}`
          : shown;
      return { short: base, full: shown !== trimmed ? trimmed : undefined, prefix: "$ " };
    }
    case "await_command": {
      const term = argStr(args.terminalName);
      const pattern = argStr(args.pattern).trim();
      const parts = [
        term ? `terminal ${term}` : "terminal ?",
        pattern ? `pattern /${pattern}/` : null,
      ].filter(Boolean);
      return { short: parts.join(" · ") };
    }
    case "execute_code": {
      const code = argStr(args.code);
      const timeout = argNum(args.timeoutSeconds);
      const suffix = timeout != null ? ` (${timeout}s timeout)` : "";
      if (!code.trim()) return { short: `Execute code${suffix}` };
      const previewMaxLength = 72;
      return {
        short: truncateForPreview(code, previewMaxLength) + suffix,
        full: code.length > previewMaxLength ? code.trim() : undefined,
      };
    }
    case "read_cell": {
      const indices = Array.isArray(args.cellIndices) ? (args.cellIndices as number[]) : [];
      const list = formatIndexList(indices);
      const out = args.includeOutputs === true ? "with outputs" : "source only";
      return {
        short: list ? `Cells ${list} (${out})` : `Cells (${out})`,
      };
    }
    case "read_cell_output": {
      const reads = Array.isArray(args.reads) ? (args.reads as { cellIndex?: number; outputIndex?: number }[]) : [];
      if (reads.length === 0) return { short: "Read outputs" };
      if (reads.length === 1) {
        const r = reads[0]!;
        const ci = argNum(r.cellIndex);
        const oi = argNum(r.outputIndex);
        return { short: `Cell ${ci ?? "?"}, output ${oi ?? "?"}` };
      }
      const preview = reads
        .slice(0, 3)
        .map((r) => `${argNum(r.cellIndex) ?? "?"}/${argNum(r.outputIndex) ?? "?"}`)
        .join(", ");
      const more = reads.length > 3 ? ` … +${reads.length - 3}` : "";
      return { short: `${reads.length} outputs: ${preview}${more}` };
    }
    case "inspect_plotly_output": {
      const cellIndex = argNum(args.cellIndex);
      const outputIndex = argNum(args.outputIndex);
      return { short: `Cell ${cellIndex ?? "?"}, output ${outputIndex ?? "?"}` };
    }
    case "execute_cell": {
      const indices = Array.isArray(args.cellIndices) ? (args.cellIndices as number[]) : [];
      const list = formatIndexList(indices);
      const timeout = argNum(args.timeoutSeconds);
      const stream = args.stream === true ? ", stream" : "";
      return {
        short: list
          ? `Cells ${list}${timeout != null ? ` · timeout ${timeout}s` : ""}${stream}`
          : "Execute cells",
      };
    }
    case "insert_cell": {
      const cells = Array.isArray(args.cells) ? args.cells : [];
      const count = cells.length;
      const idx = argNum(args.startIndex);
      const at = idx === -1 ? "end" : idx !== undefined ? `index ${idx}` : "?";
      return { short: count ? `Insert ${count} cell${count === 1 ? "" : "s"} at ${at}` : `Insert cells at ${at}` };
    }
    case "delete_cell": {
      const indices = Array.isArray(args.cellIndices) ? (args.cellIndices as number[]) : [];
      const list = formatIndexList(indices);
      const inc = args.includeSource === true ? " · include source in reply" : "";
      return { short: list ? `Cells ${list}${inc}` : "Delete cells" };
    }
    case "overwrite_cell_source": {
      const cells = Array.isArray(args.cells) ? (args.cells as { cellIndex?: number; newSource?: string }[]) : [];
      if (cells.length === 0) return { short: "Edit cells" };
      const first = cells[0]!;
      const idx = argNum(first.cellIndex);
      const src = argStr(first.newSource);
      if (cells.length === 1) {
        if (!src.trim()) return { short: `Edit cell ${idx ?? "?"}` };
        return {
          short: `Cell ${idx ?? "?"}: ${truncateForPreview(src, 80)}`,
          full: src.length > 80 ? src : undefined,
        };
      }
      return {
        short: `${cells.length} cells from index ${idx ?? "?"}: ${truncateForPreview(src, 60)}`,
        full: src.length > 60 ? src : undefined,
      };
    }
    case "edit_orion_metadata":
      return buildEditOrionMetadataPreview(args);
    case "read_notebook": {
      const name = argStr(args.notebookName);
      const start = argNum(args.startIndex);
      const limit = argNum(args.limit);
      const startCell = start ?? 0;
      const lim = limit ?? 1;
      const endCell = startCell + Math.max(lim, 1) - 1;
      const nb = name ? `"${name}"` : "Active notebook";
      return { short: `${nb} · cells ${startCell}–${endCell}` };
    }
    case "read_file": {
      const filePath = argStr(args.filePath);
      const start = argNum(args.startLine);
      const end = argNum(args.endLine);
      let range: string;
      if (start != null && end != null && end === 0) {
        range = `lines ${start}–end`;
      } else if (start != null && end != null) {
        range = `lines ${start}–${end}`;
      } else {
        range = "lines ?";
      }
      return { short: `${filePath} · ${range}` };
    }
    case "web_fetch": {
      const url = argStr(args.url);
      return { short: url ? `Web Fetch ${truncateForPreview(url, 100)}` : "Web Fetch" };
    }
    case "web_search": {
      const query = argStr(args.query);
      return { short: query ? `Web Search "${truncateForPreview(query, 100)}"` : "Web Search" };
    }
    case "load_skill": {
      const name = argStr(args.name);
      return {
        short: name ? `Loaded skill ${name}` : "Loaded skill",
      };
    }
    case "edit_file":
      return buildEditFileExpandedPreview(args, leadingText, isError);
    default:
      return null;
  }
}

// ============================================================================
// Approval preview
// ============================================================================

/**
 * Returns a human-readable preview of what a dangerous tool will do,
 * shown when the user is asked to approve.
 */
export function getApprovalPreview(
  toolName: OrionToolName,
  args: Record<string, unknown>
): ToolInvocationArgsPreview | null {
  switch (toolName) {
    case "bash":
      if (!argStr(args.command).trim()) return null;
      return buildExpandedArgsPreview(toolName, args, null, false);

    case "execute_code":
      if (!argStr(args.code).trim()) return null;
      return buildExpandedArgsPreview(toolName, args, null, false);

    case "execute_cell": {
      const indices = Array.isArray(args.cellIndices) ? (args.cellIndices as number[]) : [];
      if (indices.length === 0) return null;
      return buildExpandedArgsPreview("execute_cell", args, null, false);
    }

    case "insert_cell": {
      const cells = Array.isArray(args.cells) ? args.cells : [];
      if (cells.length === 0) return null;
      const count = cells.length;
      const idx = argNum(args.startIndex);
      const at = idx === -1 ? "end" : idx !== undefined ? `index ${idx}` : "?";
      const first = cells[0] as { cellSource?: string } | undefined;
      const src = typeof first?.cellSource === "string" ? first.cellSource : "";
      const head = `Insert ${count} cell${count === 1 ? "" : "s"} at ${at}`;
      if (!src.trim()) return { short: head };
      return {
        short: `${head}: ${truncateForPreview(src, 80)}`,
        full: src.length > 80 ? src : undefined,
      };
    }

    case "delete_cell": {
      const indices = Array.isArray(args.cellIndices) ? (args.cellIndices as number[]) : [];
      const list = formatIndexList(indices);
      const inc = args.includeSource === true ? ", include source in reply" : "";
      return list ? { short: `Delete cell(s): ${list}${inc}` } : null;
    }

    case "overwrite_cell_source": {
      const cells = Array.isArray(args.cells) ? (args.cells as { cellIndex?: number; newSource?: string }[]) : [];
      if (cells.length === 0) return null;
      const first = cells[0]!;
      const idx = argNum(first.cellIndex);
      const src = argStr(first.newSource);
      if (cells.length === 1) {
        if (!src.trim()) return { short: `Edit cell ${idx ?? "?"}` };
        return {
          short: `Cell ${idx ?? "?"}: ${truncateForPreview(src, 80)}`,
          full: src.length > 80 ? src : undefined,
        };
      }
      return {
        short: `${cells.length} cells from index ${idx ?? "?"}: ${truncateForPreview(src, 60)}`,
        full: src.length > 60 ? src : undefined,
      };
    }

    case "edit_orion_metadata":
      return buildEditOrionMetadataPreview(args);

    case "restart_notebook": {
      const name = argStr(args.notebookName);
      return { short: `Restart kernel for ${name ? `"${name}"` : "active notebook"}` };
    }

    case "edit_file":
      return buildEditFileApprovalPreview(args);

    case "update_memory": {
      const reason = argStr(args.reason).trim();
      const content = argStr(args.content);
      return {
        short: reason || `Replace ORION.md (${content.length} characters)`,
      };
    }

    default:
      return null;
  }
}
