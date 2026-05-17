/**
 * UseNotebookTool - Connect to or create a notebook and associate it with a kernel
 *
 * This is the most critical tool -- it establishes the notebook-kernel
 * connection required by all other cell operation tools.
 *
 * Supports two modes:
 * - "connect": Attach to an existing notebook file
 * - "create": Create a new notebook file and start a fresh kernel
 *
 * On success the response includes the generated notebookId that the model
 * must use in subsequent tool calls (read_notebook, restart_notebook, etc.).
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { UseNotebookParams } from "./types";

export class UseNotebookTool extends BaseTool {
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
   * Connect to or create a notebook file and associate it with a kernel.
   *
   * @param params.notebookName - Human-readable label for this notebook (display only)
   * @param params.notebookPath - Path to the notebook file (relative to Jupyter root)
   * @param params.mode         - "connect" to attach to existing, "create" to make new
   * @param params.kernelId     - Kernel ID to connect to, or empty string to start a new kernel
   * @returns Status message including the notebookId to use in subsequent calls
   */
  async execute(params: UseNotebookParams): Promise<string> {
    const { notebookName, notebookPath, mode, kernelId } = params;
    const trimmedKernelId = kernelId.trim();
    const infoList: string[] = [];

    // ---- Check if this path is already registered ----
    const existing = this.notebookManager.getByPath(notebookPath);

    if (existing) {
      if (mode === "create") {
        return (
          `[WARNING] A notebook at '${notebookPath}' is already registered (id: ${existing.id}, ` +
          `name: '${existing.entry.name}'). DO NOT CREATE AGAIN. ` +
          `Use notebookId '${existing.id}' to operate on it.`
        );
      }

      // mode === "connect": reactivate if not already current
      const currentId = this.notebookManager.getCurrentNotebookId();
      if (existing.id === currentId) {
        return (
          `[WARNING] Notebook at '${notebookPath}' (id: ${existing.id}) is already the active notebook. ` +
          `DO NOT REACTIVATE AGAIN.`
        );
      }

      infoList.push(
        `[INFO] Reactivating notebook '${existing.entry.name}' (id: ${existing.id}) ` +
        `and deactivating current notebook.`
      );
      this.notebookManager.setCurrentNotebook(existing.id);
      this.kernelService.setActivePath(notebookPath);

      // Cell count
      try {
        const notebook = await this.readNotebook(notebookPath);
        infoList.push(`\nNotebook has ${notebook.cells.length} cells.`);
      } catch (error) {
        infoList.push(
          `\n[WARNING] Could not read notebook summary: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      return infoList.join("\n");
    }

    // ---- New notebook registration ----

    if (mode === "connect") {
      const exists = await this.checkNotebookExists(notebookPath);
      if (!exists) {
        return `[ERROR] '${notebookPath}' not found on the Jupyter server. Please check the notebook already exists.`;
      }
    } else if (mode === "create") {
      await this.createNotebook(notebookPath);
      infoList.push(`[INFO] Created new notebook at '${notebookPath}'.`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("agentNotebookCreated", { detail: { path: notebookPath } })
        );
      }
    }

    // Determine kernel ID
    let resolvedKernelId: string;

    if (trimmedKernelId) {
      const kernelExists = await this.verifyKernelExists(trimmedKernelId);
      if (!kernelExists) {
        return `[ERROR] Kernel '${trimmedKernelId}' not found on the Jupyter server. Use list_kernels to check available kernels.`;
      }
      const connectedKernel = await this.kernelService.connectToKernel(trimmedKernelId);
      resolvedKernelId = connectedKernel.id;
      infoList.push(`[INFO] Connected to existing kernel '${resolvedKernelId}'.`);
    } else {
      const kernel = await this.kernelService.startKernel("python3", notebookPath);
      resolvedKernelId = kernel.id;
      infoList.push(`[INFO] Started new kernel '${resolvedKernelId}'.`);
    }

    // Register in notebook manager — receives the generated UUID
    const notebookId = this.notebookManager.addNotebook(notebookName, notebookPath, resolvedKernelId);
    this.notebookManager.setCurrentNotebook(notebookId);
    infoList.push(
      `[INFO] Successfully activated notebook '${notebookName}' (id: ${notebookId}). ` +
      `Use notebookId '${notebookId}' in subsequent tool calls (read_notebook, restart_notebook, unuse_notebook).`
    );

    // Cell count
    try {
      const notebook = await this.readNotebook(notebookPath);
      infoList.push(`\nNotebook has ${notebook.cells.length} cells.`);
    } catch (error) {
      infoList.push(
        `\n[WARNING] Could not read notebook summary: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return infoList.join("\n");
  }

  /**
   * Check if a notebook file exists on the Jupyter server.
   */
  private async checkNotebookExists(path: string): Promise<boolean> {
    try {
      const contents = this.kernelService.getContentsManager();
      await contents.get(path, { content: false });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify a kernel ID exists on the Jupyter server.
   */
  private async verifyKernelExists(kernelId: string): Promise<boolean> {
    try {
      const manager = this.kernelService.getKernelManager();
      await manager.ready;
      const model = await manager.findById(kernelId);
      return !!model;
    } catch {
      return false;
    }
  }
}
