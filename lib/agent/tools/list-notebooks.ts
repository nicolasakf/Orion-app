/**
 * ListNotebooksTool - List all notebooks managed through the NotebookManager
 *
 * Returns a formatted table of notebooks that have been registered
 * via the use_notebook tool. Does NOT scan the filesystem.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";

export class ListNotebooksTool extends BaseTool {
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
   * List all managed notebooks with their metadata.
   *
   * @returns TSV-formatted table with ID, Name, Path, Kernel_ID, Active columns
   */
  async execute(): Promise<string> {
    const notebooks = this.notebookManager.listAll();

    if (notebooks.length === 0) {
      return "[WARNING] No managed notebooks. Use the use_notebook tool to manage notebooks first.";
    }

    const headers = ["ID", "Name", "Path", "Kernel_ID", "Active"];
    const rows = notebooks
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((nb) => [
        nb.id,
        nb.name,
        nb.path,
        nb.kernelId,
        nb.isCurrent ? "✓" : "",
      ]);

    return this.formatTSV(headers, rows);
  }
}
