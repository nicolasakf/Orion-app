/**
 * InsertCellTool - Insert one or more cells at a specified position in the notebook
 *
 * Creates new code or markdown cells and inserts them consecutively at the given
 * starting index. Uses -1 as a special index to append at the end.
 * Writes the updated notebook back to the Jupyter server.
 */

import { BaseTool } from "./base-tool";
import { hashCheckpointPayload } from "@/lib/agent/edit-checkpoints";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { EditCheckpointRecorder } from "../edit-checkpoint-recorder";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type { InsertCellParams } from "./types";

export class InsertCellTool extends BaseTool {
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
   * Insert one or more cells at the specified position in the current notebook.
   *
   * @param params.cells - Array of cells to insert (each with cellType and cellSource)
   * @param params.startIndex - Target index for first cell (0-based, -1 to append)
   * @returns Status message confirming insertion
   */
  async execute(params: InsertCellParams): Promise<string> {
    const { cells, startIndex } = params;

    // Resolve current notebook
    const path = this.notebookManager.getCurrentNotebookPath();
    if (!path) {
      return "[ERROR] No current notebook is active. Use use_notebook first.";
    }

    // Read notebook
    const notebook = await this.readNotebook(path);
    this.ensureNotebookCellIds(notebook);
    const totalCells = notebook.cells.length;

    // Validate and normalize index
    const actualIndex = this.validateInsertionIndex(startIndex, totalCells);

    // Create the new cells and insert them consecutively
    const newCells = cells.map((cell) =>
      cell.cellType === "code"
        ? this.createCodeCell(cell.cellSource || "")
        : this.createMarkdownCell(cell.cellSource || "")
    );

    // Insert all cells at once (splice at actualIndex, insert 0 items to delete, add newCells)
    notebook.cells.splice(actualIndex, 0, ...newCells);

    // Write notebook back
    await this.writeNotebook(path, notebook);

    await Promise.all(
      newCells.map((cell, offset) => {
        const cellId = this.getCellOrionId(cell);
        if (!cellId) return Promise.resolve();
        return this.checkpointRecorder?.recordTarget(
          {
            kind: "notebook_cell",
            operation: "insert",
            path,
            targetId: cellId,
            before: { index: actualIndex + offset, source: "", cell: null },
            after: {
              index: actualIndex + offset,
              source: this.normalizeCellSource(cell.source),
              cell,
            },
            beforeHash: hashCheckpointPayload({ source: "" }),
            afterHash: hashCheckpointPayload({
              source: this.normalizeCellSource(cell.source),
            }),
          },
          this.checkpointContext ?? undefined
        ) ?? Promise.resolve();
      })
    );

    const newTotalCells = notebook.cells.length;

    const infoList: string[] = [];
    const count = cells.length;
    infoList.push(
      `${count} cell${count === 1 ? "" : "s"} inserted successfully at index ${actualIndex}!`
    );
    infoList.push(`Notebook now has ${newTotalCells} cells`);

    return infoList.join("\n");
  }

  /**
   * Validate and normalize cell insertion index.
   *
   * @param cellIndex - Requested index (-1 means append)
   * @param totalCells - Current number of cells
   * @returns Actual insertion index
   * @throws Error if index is out of valid range
   */
  private validateInsertionIndex(
    cellIndex: number,
    totalCells: number
  ): number {
    if (cellIndex < -1 || cellIndex > totalCells) {
      throw new Error(
        `Index ${cellIndex} is outside valid range [-1, ${totalCells}]. ` +
        `Use -1 to append at end.`
      );
    }

    return cellIndex === -1 ? totalCells : cellIndex;
  }
}
