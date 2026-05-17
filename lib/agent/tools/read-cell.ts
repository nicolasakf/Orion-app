/**
 * ReadCellTool - Read specific cells from the current notebook
 *
 * Returns each cell's type, execution count, source, and optionally
 * its outputs (for code cells).
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { ReadCellParams } from "./types";

const BATCH_SEPARATOR = "\n\n==========\n\n";

export class ReadCellTool extends BaseTool {
  private notebookManager: NotebookManager;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    notebookManager: NotebookManager
  ) {
    super(kernelService, sidecar);
    this.notebookManager = notebookManager;
  }

  /**
   * Read one or more cells from the currently active notebook.
   *
   * @param params.cellIndices - 0-based indices (negative counts from end)
   * @param params.includeOutputs - Include outputs for code cells (default: true)
   * @returns Formatted cell information
   */
  async execute(params: ReadCellParams): Promise<string> {
    const { cellIndices, includeOutputs } = params;
    const includeOrionMetadata = params.includeOrionMetadata === true;

    if (!cellIndices || cellIndices.length === 0) {
      return "[ERROR] cellIndices must contain at least one index.";
    }

    const path = this.notebookManager.getCurrentNotebookPath();
    if (!path) {
      return "[ERROR] No current notebook is active. Use use_notebook first.";
    }

    const notebook = await this.readNotebook(path);
    const totalCells = notebook.cells.length;

    const blocks: string[] = [];

    for (const cellIndex of cellIndices) {
      let resolvedIndex = cellIndex;
      if (resolvedIndex < 0) {
        resolvedIndex = totalCells + resolvedIndex;
      }

      if (resolvedIndex < 0 || resolvedIndex >= totalCells) {
        blocks.push(
          `[ERROR] Cell index ${cellIndex} is out of range. Notebook has ${totalCells} cells.`
        );
        continue;
      }

      const cell = notebook.cells[resolvedIndex];
      const infoList: string[] = [];

      const execCount =
        cell.cell_type === "code" && cell.execution_count != null
          ? String(cell.execution_count)
          : "N/A";
      infoList.push(
        `=====Cell ${resolvedIndex} | type: ${cell.cell_type} | execution count: ${execCount}=====`
      );

      const source = this.normalizeCellSource(cell.source);
      infoList.push(source);

      if (includeOrionMetadata) {
        infoList.push("--- Orion Metadata ---");
        infoList.push(this.formatOrionMetadata(cell.metadata));
      }

      if (cell.cell_type === "code" && includeOutputs && cell.outputs && cell.outputs.length > 0) {
        infoList.push("--- Outputs ---");
        const outputTexts = this.extractOutputText(cell.outputs);
        infoList.push(...outputTexts);
      }

      blocks.push(this.truncateOutput(infoList.join("\n")));
    }

    return this.truncateOutput(blocks.join(BATCH_SEPARATOR));
  }

  /**
   * Format only the Orion-owned metadata namespace for compact inspection.
   */
  private formatOrionMetadata(metadata: unknown): string {
    if (!metadata || typeof metadata !== "object") {
      return "{}";
    }
    const orion = (metadata as Record<string, unknown>).orion;
    if (orion === undefined) {
      return "{}";
    }
    return JSON.stringify(orion);
  }
}
