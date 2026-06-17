/**
 * DeleteCellTool - Delete one or more cells from the current notebook
 *
 * Supports deleting multiple cells at once by providing an array of indices.
 * Deletes in reverse order to maintain correct indices.
 * Writes the updated notebook back to the Jupyter server.
 */

import { BaseTool } from "./base-tool";
import { hashCheckpointPayload } from "@/lib/agent/edit-checkpoints";
import {
  computeCellSourceDelta,
  formatCellSourceDeltaDiffs,
  formatCellSourceDeltaSummary,
} from "@/lib/notebook/cell-source-diff";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { EditCheckpointRecorder } from "../edit-checkpoint-recorder";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type { DeleteCellParams, NotebookCell } from "./types";

export class DeleteCellTool extends BaseTool {
  private notebookManager: NotebookManager;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    notebookManager: NotebookManager,
    snapshotProvider?: OpenDocumentSnapshotProvider | null,
    checkpointRecorder?: EditCheckpointRecorder | null
  ) {
    super(kernelService, sidecar, snapshotProvider, checkpointRecorder);
    this.notebookManager = notebookManager;
  }

  /**
   * Delete one or more cells from the current notebook.
   *
   * @param params.cellIndices - Array of 0-based cell indices to delete
   * @param params.includeSource - Include deleted cell source in the response
   * @returns Status message with deleted cell information
   */
  async execute(params: DeleteCellParams): Promise<string> {
    const { cellIndices, includeSource } = params;

    if (!cellIndices || cellIndices.length === 0) {
      return "[ERROR] No cell indices provided.";
    }

    // Resolve current notebook
    const path = this.notebookManager.getCurrentNotebookPath();
    if (!path) {
      return "[ERROR] No current notebook is active. Use use_notebook first.";
    }

    // Read notebook
    const notebook = await this.readNotebook(path);
    this.ensureNotebookCellIds(notebook);
    const totalCells = notebook.cells.length;

    // Validate indices
    const maxIndex = Math.max(...cellIndices);
    if (maxIndex >= totalCells) {
      return `[ERROR] Cell index ${maxIndex} is out of range. Notebook has ${totalCells} cells.`;
    }

    const minIndex = Math.min(...cellIndices);
    if (minIndex < 0) {
      return `[ERROR] Cell index ${minIndex} is invalid. Indices must be >= 0.`;
    }

    // Capture cell info before deletion
    const deletedCells: Array<{
      index: number;
      cellType: string;
      source: string;
      cellId: string | null;
      cell: NotebookCell;
    }> = [];

    for (const idx of cellIndices) {
      const cell: NotebookCell = notebook.cells[idx];
      deletedCells.push({
        index: idx,
        cellType: cell.cell_type,
        source: this.normalizeCellSource(cell.source),
        cellId: this.getCellOrionId(cell),
        cell: JSON.parse(JSON.stringify(cell)) as NotebookCell,
      });
    }

    // Delete in reverse order to preserve indices
    const sortedIndices = [...cellIndices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      notebook.cells.splice(idx, 1);
    }

    // Write notebook back
    await this.writeNotebook(path, notebook);
    await Promise.all(
      deletedCells.map((deleted) => {
        if (!deleted.cellId) return Promise.resolve();
        return this.checkpointRecorder?.recordTarget(
          {
            kind: "notebook_cell",
            operation: "delete",
            path,
            targetId: deleted.cellId,
            before: {
              index: deleted.index,
              source: deleted.source,
              cell: deleted.cell,
            },
            after: { index: deleted.index, source: "", cell: null },
            beforeHash: hashCheckpointPayload({ source: deleted.source }),
            afterHash: hashCheckpointPayload({ source: "" }),
          },
          this.checkpointContext ?? undefined
        ) ?? Promise.resolve();
      })
    );

    // Build response
    const infoList: string[] = [];
    const sourceDeltas = deletedCells.map((deleted) =>
      computeCellSourceDelta(deleted.index, deleted.source, "")
    );
    for (const deleted of deletedCells) {
      infoList.push(
        `Cell ${deleted.index} (${deleted.cellType}) deleted successfully.`
      );
      if (includeSource) {
        infoList.push(`deleted cell source:\n${deleted.source}`);
        infoList.push("\n---\n");
      }
    }
    infoList.push("");
    infoList.push(formatCellSourceDeltaSummary(sourceDeltas));
    infoList.push("");
    infoList.push(formatCellSourceDeltaDiffs(sourceDeltas));

    return infoList.join("\n");
  }
}
