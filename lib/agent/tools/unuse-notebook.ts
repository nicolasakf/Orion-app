/**
 * UnuseNotebookTool - Remove a notebook from the managed set
 *
 * Disconnects the notebook from the NotebookManager tracking.
 * The kernel continues running -- this only removes the association.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { UnuseNotebookParams } from "./types";

export class UnuseNotebookTool extends BaseTool {
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
   * Remove a notebook from the NotebookManager.
   *
   * @param params.notebookId - ID returned by use_notebook
   * @returns Status message
   */
  async execute(params: UnuseNotebookParams): Promise<string> {
    const { notebookId } = params;

    if (!this.notebookManager.has(notebookId)) {
      return (
        `[WARNING] Notebook ID '${notebookId}' is not connected. ` +
        `All currently connected IDs: ${this.notebookManager.listIds().join(", ") || "none"}`
      );
    }

    const entry = this.notebookManager.get(notebookId);
    const label = entry?.name ?? notebookId;
    const currentId = this.notebookManager.getCurrentNotebookId();
    const wasCurrent = currentId === notebookId;

    const success = this.notebookManager.removeNotebook(notebookId);

    if (!success) {
      return `[WARNING] Notebook ID '${notebookId}' was not found.`;
    }

    let message = `Notebook '${label}' (id: ${notebookId}) unused successfully.`;

    if (wasCurrent) {
      const newCurrentId = this.notebookManager.getCurrentNotebookId();
      if (newCurrentId) {
        const newEntry = this.notebookManager.get(newCurrentId);
        message += ` Current notebook switched to '${newEntry?.name ?? newCurrentId}' (id: ${newCurrentId}).`;
      } else {
        message += " No notebooks remaining.";
      }
    }

    return message;
  }
}
