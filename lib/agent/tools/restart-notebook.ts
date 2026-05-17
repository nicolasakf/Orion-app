/**
 * RestartNotebookTool - Restart the kernel for a managed notebook
 *
 * Restarts the kernel associated with a specific notebook, clearing
 * all runtime state (variables, imported packages, etc.).
 * Uses the @jupyterlab/services KernelManager for the restart call.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { RestartNotebookParams } from "./types";

export class RestartNotebookTool extends BaseTool {
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
   * Restart the kernel for a managed notebook.
   *
   * @param params.notebookId - ID returned by use_notebook; empty string uses the active notebook
   * @returns Status message
   */
  async execute(params: RestartNotebookParams): Promise<string> {
    const trimmed = params.notebookId.trim();
    const notebookId =
      trimmed === ""
        ? this.notebookManager.getCurrentNotebookId()
        : trimmed;

    if (!notebookId) {
      return "[WARNING] No notebook specified and no current notebook is active.";
    }

    if (!this.notebookManager.has(notebookId)) {
      return (
        `[WARNING] Notebook ID '${notebookId}' is not connected. ` +
        `All currently connected IDs: ${this.notebookManager.listIds().join(", ") || "none"}`
      );
    }

    const kernelId = this.notebookManager.getKernelId(notebookId);
    if (!kernelId) {
      return `[ERROR] Failed to restart notebook '${notebookId}': kernel ID not found.`;
    }

    const entry = this.notebookManager.get(notebookId);
    const label = entry?.name ?? notebookId;

    try {
      await this.kernelService.restartKernelById(kernelId);
      return (
        `Notebook '${label}' kernel restarted successfully. ` +
        `Memory state and imported packages have been cleared.`
      );
    } catch (error) {
      return (
        `[ERROR] Failed to restart notebook '${label}': ` +
        `${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

}
