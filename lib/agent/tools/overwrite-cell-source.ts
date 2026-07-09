/**
 * OverwriteCellSourceTool - Replace the source content of existing cells
 *
 * Overwrites the source of one or more cells with new content.
 * Generates a unified diff per cell showing the changes made.
 * Writes the updated notebook back to the Jupyter server once per call.
 */

import { BaseTool } from "./base-tool";
import { hashCheckpointPayload } from "@/lib/agent/edit-checkpoints";
import {
  computeCellSourceDelta,
  formatCellSourceDeltaDiffs,
  formatCellSourceDeltaSummary,
  type CellSourceDelta,
} from "@/lib/notebook/cell-source-diff";
import { NotebookManager } from "./notebook-manager";
import { mergeCellOrionMetadataJson } from "./orion-metadata-merge";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { EditCheckpointRecorder } from "../edit-checkpoint-recorder";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type { OverwriteCellSourceParams } from "./types";

export class OverwriteCellSourceTool extends BaseTool {
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
   * Overwrite the source of one or more cells in the current notebook.
   *
   * @param params.cells - Entries with cellIndex and newSource, applied in order
   * @returns Status messages with diffs
   */
  async execute(params: OverwriteCellSourceParams): Promise<string> {
    const { cells } = params;

    if (!cells || cells.length === 0) {
      return "[ERROR] cells must contain at least one { cellIndex, newSource } entry.";
    }

    const path = this.notebookManager.getCurrentNotebookPath();
    if (!path) {
      return "[ERROR] No current notebook is active. Use use_notebook first.";
    }

    const notebook = await this.readNotebook(path);
    this.ensureNotebookCellIds(notebook);
    const totalCells = notebook.cells.length;

    for (const { cellIndex } of cells) {
      if (cellIndex < 0 || cellIndex >= totalCells) {
        return `[ERROR] Cell index ${cellIndex} is out of range. Notebook has ${totalCells} cells.`;
      }
    }

    for (const { cellIndex, orionMetadataJson } of cells) {
      const previewCell = JSON.parse(JSON.stringify(notebook.cells[cellIndex]));
      const metadataError = mergeCellOrionMetadataJson(
        previewCell,
        orionMetadataJson ?? "",
        `Cell ${cellIndex}`,
      );
      if (metadataError) return metadataError;
    }

    const messages: string[] = [];
    const checkpointEntries: Array<{
      cellIndex: number;
      cellId: string;
      oldSource: string;
      newSource: string;
      beforeCell: unknown;
      afterCell: unknown;
    }> = [];
    const sourceDeltas: CellSourceDelta[] = [];
    const metadataMessages: string[] = [];

    for (const { cellIndex, newSource, orionMetadataJson } of cells) {
      const cell = notebook.cells[cellIndex];
      const cellId = this.getCellOrionId(cell);
      const oldSource = this.normalizeCellSource(cell.source);
      const beforeCell = JSON.parse(JSON.stringify(cell));

      cell.source = [newSource];

      if (cell.cell_type === "code") {
        cell.outputs = [];
        cell.execution_count = null;
      }

      const metadataError = mergeCellOrionMetadataJson(
        cell,
        orionMetadataJson ?? "",
        `Cell ${cellIndex}`,
      );
      if (metadataError) return metadataError;
      if ((orionMetadataJson ?? "").trim()) {
        metadataMessages.push(`Cell ${cellIndex}: merged Orion metadata`);
      }

      const delta = computeCellSourceDelta(cellIndex, oldSource, newSource);
      sourceDeltas.push(delta);
      if (cellId) {
        checkpointEntries.push({
          cellIndex,
          cellId,
          oldSource,
          newSource,
          beforeCell,
          afterCell: JSON.parse(JSON.stringify(cell)),
        });
      }

      if (delta.diffText === "no changes detected") {
        messages.push(`Cell ${cellIndex} overwritten successfully - no changes detected`);
      } else {
        messages.push(`Cell ${cellIndex} overwritten successfully!`);
      }
    }

    await this.writeNotebook(path, notebook);
    await Promise.all(
      checkpointEntries.map((entry) =>
        this.checkpointRecorder?.recordTarget(
          {
            kind: "notebook_cell",
            operation: "update",
            path,
            targetId: entry.cellId,
            before: {
              index: entry.cellIndex,
              source: entry.oldSource,
              cell: entry.beforeCell,
            },
            after: {
              index: entry.cellIndex,
              source: entry.newSource,
              cell: entry.afterCell,
            },
            beforeHash: hashCheckpointPayload({ source: entry.oldSource }),
            afterHash: hashCheckpointPayload({ source: entry.newSource }),
          },
          this.checkpointContext ?? undefined
        ) ?? Promise.resolve()
      )
    );

    return [
      messages.join("\n\n---\n\n"),
      formatCellSourceDeltaSummary(sourceDeltas),
      metadataMessages.length > 0
        ? `Orion metadata changes:\n${metadataMessages.join("\n")}`
        : "",
      formatCellSourceDeltaDiffs(sourceDeltas),
    ].filter(Boolean).join("\n\n");
  }
}
