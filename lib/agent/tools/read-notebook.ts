/**
 * ReadNotebookTool - Read a notebook and return cell information
 *
 * Returns an overview of notebook cells with their index, type,
 * execution count, source preview, and per-output type/mime summaries
 * (same summaries as detailed format; not full output bodies). Supports pagination.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { ReadNotebookParams, NotebookDocument } from "./types";

export class ReadNotebookTool extends BaseTool {
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
   * Read the notebook and return formatted cell information.
   *
   * @param params.notebookId - ID returned by use_notebook; empty string uses the current notebook
   * @param params.responseFormat - "brief" (table overview) or "detailed" (full source + output summaries)
   * @param params.startIndex - Starting cell index for pagination
   * @param params.limit - Maximum cells to return (1–100)
   * @returns Formatted cell information
   */
  async execute(params: ReadNotebookParams): Promise<string> {
    const { notebookId, responseFormat, startIndex, limit } = params;
    const includeOrionMetadata = params.includeOrionMetadata === true;

    // Resolve notebook ID
    const trimmedId = notebookId.trim();
    const id =
      trimmedId === ""
        ? this.notebookManager.getCurrentNotebookId()
        : trimmedId;
    if (!id) {
      return "[ERROR] No notebook specified and no current notebook is active.";
    }

    if (!this.notebookManager.has(id)) {
      return (
        `[WARNING] Notebook ID '${id}' is not connected. ` +
        `All currently connected IDs: ${this.notebookManager.listIds().join(", ") || "none"}`
      );
    }

    // Read notebook from Jupyter server
    const path = this.notebookManager.getNotebookPath(id);
    if (!path) {
      return `[ERROR] Cannot determine path for notebook ID '${id}'.`;
    }

    const entry = this.notebookManager.get(id);
    const notebook = await this.readNotebook(path);
    const totalCells = notebook.cells.length;

    if (startIndex >= totalCells) {
      return `[ERROR] Start index ${startIndex} is out of range. Notebook has ${totalCells} cells.`;
    }

    const infoList: string[] = [];
    infoList.push(`Notebook '${entry?.name ?? id}' has ${totalCells} cells.\n`);
    if (includeOrionMetadata) {
      infoList.push(`Notebook Orion Metadata: ${this.formatOrionMetadata(notebook.metadata)}\n`);
    }

    if (responseFormat === "brief") {
      infoList.push(this.formatBrief(notebook, startIndex, limit, includeOrionMetadata));
    } else {
      infoList.push(this.formatDetailed(notebook, startIndex, limit, includeOrionMetadata));
    }

    return this.truncateOutput(infoList.join("\n"));
  }

  /**
   * Format a brief overview table of cells (index, type, count, first line, output summaries).
   */
  private formatBrief(
    notebook: NotebookDocument,
    startIndex: number,
    limit: number,
    includeOrionMetadata: boolean
  ): string {
    const endIndex = limit > 0
      ? Math.min(startIndex + limit, notebook.cells.length)
      : notebook.cells.length;
    const cells = notebook.cells.slice(startIndex, endIndex);

    if (cells.length === 0) {
      return "No cells in the specified range";
    }

    const headers = includeOrionMetadata
      ? ["Index", "Type", "Count", "First Line", "Orion Metadata", "Outputs"]
      : ["Index", "Type", "Count", "First Line", "Outputs"];
    const rows = cells.map((cell, i) => {
      const index = String(startIndex + i);
      const type = cell.cell_type;
      const count =
        cell.cell_type === "code" && cell.execution_count != null
          ? String(cell.execution_count)
          : "N/A";
      const firstLine = this.getCellOverview(cell);
      const outputSummary =
        cell.cell_type === "code" && cell.outputs && cell.outputs.length > 0
          ? this.extractOutputSummary(cell.outputs).join("; ")
          : "";
      if (includeOrionMetadata) {
        return [
          index,
          type,
          count,
          firstLine,
          this.formatOrionMetadata(cell.metadata),
          outputSummary,
        ];
      }
      return [index, type, count, firstLine, outputSummary];
    });

    return this.formatTSV(headers, rows);
  }

  /**
   * Format a detailed view of cells with full source and per-output type/mime summaries.
   */
  private formatDetailed(
    notebook: NotebookDocument,
    startIndex: number,
    limit: number,
    includeOrionMetadata: boolean
  ): string {
    const endIndex = limit > 0
      ? Math.min(startIndex + limit, notebook.cells.length)
      : notebook.cells.length;
    const cells = notebook.cells.slice(startIndex, endIndex);

    if (cells.length === 0) {
      return "No cells in the specified range";
    }

    const parts: string[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cellIndex = startIndex + i;
      const execCount =
        cell.cell_type === "code" && cell.execution_count != null
          ? String(cell.execution_count)
          : "N/A";

      parts.push(
        `=====Cell ${cellIndex} | type: ${cell.cell_type} | execution count: ${execCount}=====`
      );

      // Source
      const source = this.normalizeCellSource(cell.source);
      parts.push(source);

      if (includeOrionMetadata) {
        parts.push("--- Orion Metadata ---");
        parts.push(this.formatOrionMetadata(cell.metadata));
      }

      // Outputs for code cells
      if (cell.cell_type === "code" && cell.outputs && cell.outputs.length > 0) {
        parts.push("--- Outputs ---");
        const outputSummaries = this.extractOutputSummary(cell.outputs);
        parts.push(...outputSummaries);
      }

      parts.push(""); // blank line between cells
    }

    return parts.join("\n");
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
