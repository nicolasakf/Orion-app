/**
 * Jupyter Notebook Tools - Native TypeScript implementations for Orion
 *
 * Server Management (2):
 *   - ListKernelsTool: Kernel introspection
 *   - ShutdownKernelTool: Shut down a kernel by ID
 *
 * Notebook Management (3):
 *   - UseNotebookTool: Connect/create notebooks
 *   - RestartNotebookTool: Restart kernels
 *   - ReadNotebookTool: Read notebook content
 *
 * Cell Operations (6):
 *   - ReadCellTool: Read individual cells
 *   - InsertCellTool: Insert new cells
 *   - DeleteCellTool: Delete cells
 *   - OverwriteCellSourceTool: Modify cell content
 *   - EditOrionMetadataTool: Modify notebook/cell metadata.orion
 *   - ExecuteCellTool: Execute cells with streaming
 *   - ExecuteCodeTool: Execute arbitrary code
 *
 * Cell Output Inspection (1):
 *   - ReadCellOutputTool: Read cell output by mime type (table/plotly/image/text)
 *
 * Terminal Management (2):
 *   - BashTool: Run shell commands in persistent terminals
 *   - AwaitCommandTool: Await completion/patterns for running commands
 *
 * File Operations (2):
 *   - ReadFileTool: Read text files (non-notebook) with optional line range
 *   - EditFileTool: Overwrite or targeted-replace text files (non-notebook)
 *
 * These are plain TypeScript classes -- NOT an MCP server.
 * No mocks: all tools connect to real Jupyter kernels and manipulate actual notebooks.
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type { EditCheckpointRecorder } from "../edit-checkpoint-recorder";
import type { TerminalPool } from "@/lib/shell/terminal-pool";

// Foundation
export { BaseTool } from "./base-tool";
export { NotebookManager } from "./notebook-manager";
export * from "./types";

// Server Management
export { ListKernelsTool } from "./list-kernels";
export { ShutdownKernelTool } from "./shutdown-kernel";

// Notebook Management
export { UseNotebookTool } from "./use-notebook";
export { RestartNotebookTool } from "./restart-notebook";
export { ReadNotebookTool } from "./read-notebook";

// Cell Operations
export { ReadCellTool } from "./read-cell";
export { InsertCellTool } from "./insert-cell";
export { DeleteCellTool } from "./delete-cell";
export { OverwriteCellSourceTool } from "./overwrite-cell-source";
export { EditOrionMetadataTool } from "./edit-orion-metadata";
export { ExecuteCellTool } from "./execute-cell";
export { ExecuteCodeTool } from "./execute-code";

// Terminal Management
export { BashTool } from "./bash";
export type { TerminalShell } from "./bash";
export { AwaitCommandTool } from "./await-command";

// File Operations
export { ReadFileTool } from "./read-file";
export { EditFileTool } from "./edit-file";

// Cell Output Inspection
export { ReadCellOutputTool } from "./read-cell-output";

// Re-import for factory function
import { NotebookManager } from "./notebook-manager";
import { ListKernelsTool } from "./list-kernels";
import { ShutdownKernelTool } from "./shutdown-kernel";
import { UseNotebookTool } from "./use-notebook";
import { RestartNotebookTool } from "./restart-notebook";
import { ReadNotebookTool } from "./read-notebook";
import { ReadCellTool } from "./read-cell";
import { InsertCellTool } from "./insert-cell";
import { DeleteCellTool } from "./delete-cell";
import { OverwriteCellSourceTool } from "./overwrite-cell-source";
import { EditOrionMetadataTool } from "./edit-orion-metadata";
import { ExecuteCellTool } from "./execute-cell";
import { ExecuteCodeTool } from "./execute-code";
import { BashTool, type TerminalShell } from "./bash";
import { AwaitCommandTool } from "./await-command";
import { ReadFileTool } from "./read-file";
import { EditFileTool } from "./edit-file";
import { ReadCellOutputTool } from "./read-cell-output";

// ============================================================================
// Tool Set Type
// ============================================================================

/** Complete set of Jupyter notebook and terminal tools with shared NotebookManager */
export interface JupyterToolSet {
  notebookManager: NotebookManager;
  tools: {
    // Server Management
    listKernels: ListKernelsTool;
    shutdownKernel: ShutdownKernelTool;
    // Notebook Management
    useNotebook: UseNotebookTool;
    restartNotebook: RestartNotebookTool;
    readNotebook: ReadNotebookTool;
    // Cell Operations
    readCell: ReadCellTool;
    insertCell: InsertCellTool;
    deleteCell: DeleteCellTool;
    overwriteCellSource: OverwriteCellSourceTool;
    editOrionMetadata: EditOrionMetadataTool;
    executeCell: ExecuteCellTool;
    executeCode: ExecuteCodeTool;
    // Terminal Management
    bash: BashTool;
    awaitCommand: AwaitCommandTool;
    // File Operations
    readFile: ReadFileTool;
    editFile: EditFileTool;
    // Cell Output Inspection
    readCellOutput: ReadCellOutputTool;
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create all Jupyter notebook and terminal tools with shared dependencies.
 *
 * This is the primary entry point for creating the tool set.
 * All tools share a single NotebookManager instance and
 * communicate with the same Jupyter kernel/server.
 *
 * @param kernelService          - KernelService instance for Jupyter communication
 * @param sidecar                - Optional KernelSidecar for traffic light state awareness
 * @param terminalPool           - Optional TerminalPool for agent terminal lifecycle management
 * @param getChatId              - Optional getter for the current chat session ID (used to associate fresh BashTool terminals with the current chat)
 * @param getWorkspaceDirectory  - Optional getter for the current workspace directory (reserved for future workspace tools)
 * @param getTerminalShell       - Optional getter for the Jupyter terminal shell family used by BashTool
 * @param snapshotProvider       - Optional provider for active in-memory editor content
 * @param checkpointRecorder     - Optional recorder for request-scoped edit checkpoints
 * @returns Complete JupyterToolSet with all tools and shared NotebookManager
 */
export function createJupyterTools(
  kernelService: KernelService,
  sidecar?: KernelSidecar | null,
  terminalPool?: TerminalPool | null,
  getChatId?: (() => string | null) | null,
  getWorkspaceDirectory?: (() => string | undefined) | null,
  getTerminalShell?: (() => TerminalShell) | null,
  snapshotProvider?: OpenDocumentSnapshotProvider | null,
  checkpointRecorder?: EditCheckpointRecorder | null
): JupyterToolSet {
  const notebookManager = new NotebookManager();
  const sc = sidecar ?? null;
  const pool = terminalPool ?? null;

  return {
    notebookManager,
    tools: {
      // Server Management
      listKernels: new ListKernelsTool(kernelService, sc),
      shutdownKernel: new ShutdownKernelTool(
        kernelService,
        sc,
        notebookManager
      ),

      // Notebook Management
      useNotebook: new UseNotebookTool(kernelService, sc, notebookManager),
      restartNotebook: new RestartNotebookTool(
        kernelService,
        sc,
        notebookManager
      ),
      readNotebook: new ReadNotebookTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider
      ),

      // Cell Operations
      readCell: new ReadCellTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider
      ),
      insertCell: new InsertCellTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider,
        checkpointRecorder
      ),
      deleteCell: new DeleteCellTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider,
        checkpointRecorder
      ),
      overwriteCellSource: new OverwriteCellSourceTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider,
        checkpointRecorder
      ),
      editOrionMetadata: new EditOrionMetadataTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider
      ),
      executeCell: new ExecuteCellTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider
      ),
      executeCode: new ExecuteCodeTool(kernelService, sc, notebookManager),

      // Terminal Management (pool-aware)
      bash: new BashTool(kernelService, sc, pool, getChatId, getTerminalShell),
      awaitCommand: new AwaitCommandTool(kernelService, sc, pool),

      // File Operations
      readFile: new ReadFileTool(kernelService, sc, snapshotProvider),
      editFile: new EditFileTool(
        kernelService,
        sc,
        snapshotProvider,
        checkpointRecorder
      ),

      // Cell Output Inspection
      readCellOutput: new ReadCellOutputTool(
        kernelService,
        sc,
        notebookManager,
        snapshotProvider
      ),
    },
  };
}
