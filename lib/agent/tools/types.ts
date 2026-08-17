/**
 * Type definitions for Jupyter notebook tools.
 *
 * Shared notebook structures are sourced from `@/lib/types` to avoid
 * duplicated model definitions across the codebase.
 */

import type {
  NotebookCellType as SharedNotebookCell,
  NotebookOutputType as SharedNotebookOutput,
  NotebookType as SharedNotebookDocument,
} from "@/lib/types";

// ============================================================================
// Shared Notebook Types (re-exported aliases)
// ============================================================================

export type NotebookDocument = SharedNotebookDocument;
export type NotebookCell = SharedNotebookCell;
export type CellOutput = SharedNotebookOutput;

// ============================================================================
// Kernel Types
// ============================================================================

/** Running kernel information returned by the Jupyter REST API */
export interface KernelModel {
  id: string;
  name: string;
  last_activity?: string;
  execution_state?: "idle" | "busy" | "starting" | "dead";
  connections?: number;
}

/** Kernel specification (available kernel types) */
export interface KernelSpecModel {
  name: string;
  display_name: string;
  language: string;
  argv?: string[];
  env?: Record<string, string>;
}

// ============================================================================
// Tool-specific Types
// ============================================================================

/** Entry in the NotebookManager tracking table */
export interface NotebookEntry {
  /** Human-readable display label provided when the notebook was registered */
  name: string;
  path: string;
  kernelId: string;
  addedAt: number;
}

/** Image content returned from cell execution */
export interface ImageContent {
  type: "image";
  mimeType: string;
  data: string;
}

// ============================================================================
// Tool Parameter Types
// ============================================================================

/** Parameters for UseNotebookTool */
export interface UseNotebookParams {
  notebookName: string;
  notebookPath: string;
  mode: "connect" | "create";
  /** Empty string starts a new kernel; otherwise connect to this kernel id */
  kernelId: string;
}

/** Parameters for ReadNotebookTool */
export interface ReadNotebookParams {
  /** ID returned by use_notebook; empty string selects the currently active notebook */
  notebookId: string;
  responseFormat: "brief" | "detailed";
  startIndex: number;
  limit: number;
  /** Include notebook/cell metadata.orion JSON in the response */
  includeOrionMetadata: boolean;
}

/** Parameters for ReadCellTool */
export interface ReadCellParams {
  /** Zero-based indices to read, in order. Negative indices count from the end of the notebook. */
  cellIndices: number[];
  includeOutputs: boolean;
  /** Include cell metadata.orion JSON in the response */
  includeOrionMetadata: boolean;
}

/** Single cell spec for InsertCellTool */
export interface InsertCellSpec {
  cellType: "code" | "markdown";
  cellSource: string;
  /** JSON object merged into metadata.orion; empty string skips metadata edits. */
  orionMetadataJson: string;
}

/** Parameters for InsertCellTool */
export interface InsertCellParams {
  cells: InsertCellSpec[];
  startIndex: number;
  /** Run the inserted code cells in the same tool call. Handled by the dispatcher. */
  execute?: boolean;
  /** Per-cell execution timeout used when `execute` is true. */
  timeoutSeconds?: number;
}

/** Parameters for DeleteCellTool */
export interface DeleteCellParams {
  cellIndices: number[];
  includeSource: boolean;
}

/** Single overwrite entry for OverwriteCellSourceTool */
export interface OverwriteCellSourceEntry {
  cellIndex: number;
  newSource: string;
  /** JSON object merged into metadata.orion; empty string skips metadata edits. */
  orionMetadataJson: string;
}

/** Parameters for OverwriteCellSourceTool */
export interface OverwriteCellSourceParams {
  /** One or more cells to update, applied in order (last write wins if the same index appears twice). */
  cells: OverwriteCellSourceEntry[];
}

/** Single Orion metadata edit entry. */
export interface EditOrionMetadataEntry {
  target: "notebook" | "cell";
  /** Zero-based cell index for cell target; use -1 for notebook target. */
  cellIndex: number;
  operation: "merge" | "replace" | "delete";
  /** Path inside metadata.orion. Empty array means the root orion object. */
  path: string[];
  /** JSON value for merge/replace; ignored for delete. */
  valueJson: string;
}

/** Parameters for EditOrionMetadataTool */
export interface EditOrionMetadataParams {
  /** ID returned by use_notebook; empty string selects the currently active notebook */
  notebookId: string;
  /** One or more Orion metadata edits, applied in order. */
  edits: EditOrionMetadataEntry[];
}

/** Parameters for ExecuteCellTool */
export interface ExecuteCellParams {
  cellIndices: number[];
  timeoutSeconds: number;
  stream: boolean;
  progressInterval: number;
}

/** Parameters for ExecuteCodeTool */
export interface ExecuteCodeParams {
  code: string;
  timeoutSeconds: number;
}

/** Parameters for RestartNotebookTool */
export interface RestartNotebookParams {
  /** ID returned by use_notebook; empty string selects the currently active notebook */
  notebookId: string;
}

/** Parameters for ShutdownKernelTool */
export interface ShutdownKernelParams {
  /** IDs of the kernels to shut down (from list_kernels) */
  kernelIds: string[];
}

/** Parameters for BashTool */
export interface BashParams {
  /** Shell command to execute in a persistent PTY terminal */
  command: string;
  /** Short, human-readable purpose shown in tool UIs */
  description: string;
  /** Exact terminalName to reuse; empty string creates a fresh chat-scoped terminal */
  terminalName: string;
  /** Working directory used only when creating a fresh chat terminal */
  cwd: string;
  /** If true, return immediately after dispatching and track completion via await_command */
  background: boolean;
}

/** Parameters for AwaitCommandTool */
export interface AwaitCommandParams {
  /** Exact terminalName returned by a prior bash or await_command result */
  terminalName: string;
  /** Optional regex to stop early when matched; empty string disables pattern matching */
  pattern: string;
}


/** Parameters for ReadFileTool */
export interface ReadFileParams {
  filePath: string;
  /** 0-based start line; 0 means beginning of file */
  startLine: number;
  /** 0-based end line (inclusive); 0 means read to end of file */
  endLine: number;
}

/** Single output read target for ReadCellOutputTool */
export interface ReadCellOutputTarget {
  cellIndex: number;
  outputIndex: number;
}

/** Parameters for ReadCellOutputTool */
export interface ReadCellOutputParams {
  /** One or more (cellIndex, outputIndex) pairs to read, in order. */
  reads: ReadCellOutputTarget[];
}

/** Structured result from read_cell_output when the output contains images */
export interface MultimodalToolResult {
  text: string;
  images: Array<{ mimeType: string; data: string }>;
}

/** Parameters for EditFileTool */
export interface EditFileParams {
  filePath: string;
  mode: "overwrite" | "replace";
  /** Full file content for overwrite mode; empty string for replace mode */
  content: string;
  /** Text to find for replace mode; empty string for overwrite mode */
  oldString: string;
  /** Replacement text for replace mode; empty string for overwrite mode */
  newString: string;
}
