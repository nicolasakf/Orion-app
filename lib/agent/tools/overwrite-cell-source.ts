/**
 * OverwriteCellSourceTool - Replace the source content of existing cells
 *
 * Overwrites the source of one or more cells with new content.
 * Generates a unified diff per cell showing the changes made.
 * Writes the updated notebook back to the Jupyter server once per call.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { OverwriteCellSourceParams } from "./types";

export class OverwriteCellSourceTool extends BaseTool {
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
    const totalCells = notebook.cells.length;

    for (const { cellIndex } of cells) {
      if (cellIndex < 0 || cellIndex >= totalCells) {
        return `[ERROR] Cell index ${cellIndex} is out of range. Notebook has ${totalCells} cells.`;
      }
    }

    const messages: string[] = [];

    for (const { cellIndex, newSource } of cells) {
      const cell = notebook.cells[cellIndex];
      const oldSource = this.normalizeCellSource(cell.source);

      cell.source = [newSource];

      if (cell.cell_type === "code") {
        cell.outputs = [];
        cell.execution_count = null;
      }

      const diff = this.generateUnifiedDiff(oldSource, newSource);

      if (!diff.trim() || diff === "no changes detected") {
        messages.push(`Cell ${cellIndex} overwritten successfully - no changes detected`);
      } else {
        messages.push(
          `Cell ${cellIndex} overwritten successfully!\n\n\`\`\`diff\n${diff}\n\`\`\``
        );
      }
    }

    await this.writeNotebook(path, notebook);

    return messages.join("\n\n---\n\n");
  }

  /**
   * Generate a unified diff between old and new source strings.
   *
   * Implements a simplified unified diff format showing context
   * around changed lines with +/- prefixes.
   */
  private generateUnifiedDiff(
    oldSource: string,
    newSource: string
  ): string {
    const oldLines = oldSource.split("\n");
    const newLines = newSource.split("\n");

    if (oldSource === newSource) {
      return "no changes detected";
    }

    const diffLines: string[] = [];
    diffLines.push("--- old");
    diffLines.push("+++ new");

    const maxLen = Math.max(oldLines.length, newLines.length);
    let inHunk = false;
    let hunkStart = -1;

    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : undefined;
      const newLine = i < newLines.length ? newLines[i] : undefined;

      if (oldLine !== newLine) {
        if (!inHunk) {
          inHunk = true;
          hunkStart = Math.max(0, i - 3);
          for (let ctx = hunkStart; ctx < i; ctx++) {
            if (ctx < oldLines.length) {
              diffLines.push(` ${oldLines[ctx]}`);
            }
          }
        }

        if (oldLine !== undefined && newLine !== undefined) {
          diffLines.push(`-${oldLine}`);
          diffLines.push(`+${newLine}`);
        } else if (oldLine !== undefined) {
          diffLines.push(`-${oldLine}`);
        } else if (newLine !== undefined) {
          diffLines.push(`+${newLine}`);
        }
      } else if (inHunk) {
        if (oldLine !== undefined) {
          diffLines.push(` ${oldLine}`);
        }

        const linesAfterChange = i - hunkStart;
        if (linesAfterChange > 6) {
          inHunk = false;
        }
      }
    }

    return diffLines.length > 2 ? diffLines.join("\n") : "no changes detected";
  }
}
