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
import { resolveAgentPath } from "../path-resolver";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";

export class UseNotebookTool extends BaseTool {
  private notebookManager: NotebookManager;
  private getJupyterRootDirectory: (() => string | undefined) | null;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    notebookManager: NotebookManager,
    getJupyterRootDirectory?: (() => string | undefined) | null,
    snapshotProvider?: OpenDocumentSnapshotProvider | null,
  ) {
    super(kernelService, sidecar, snapshotProvider);
    this.notebookManager = notebookManager;
    this.getJupyterRootDirectory = getJupyterRootDirectory ?? null;
  }

  /**
   * Connect to or create a notebook file and associate it with a kernel.
   *
   * @param params.notebookName - Human-readable label for this notebook (display only)
   * @param params.notebookPath - Agent-facing notebook path; absolute paths are normalized to Jupyter-relative paths
   * @param params.mode         - "connect" to attach to existing, "create" to make new
   * @param params.kernelId     - Kernel ID to connect to, or empty string to start a new kernel
   * @returns Status message including the notebookId to use in subsequent calls
   */
  async execute(params: UseNotebookParams): Promise<string> {
    const { notebookName, notebookPath, mode, kernelId } = params;
    const trimmedKernelId = kernelId.trim();
    const infoList: string[] = [];
    const resolvedPath = resolveAgentPath(notebookPath, {
      rootDirectory: this.getJupyterRootDirectory?.(),
    });
    if (!resolvedPath.ok) {
      return resolvedPath.error;
    }
    const jupyterPath = resolvedPath.jupyterPath;

    // ---- Check if this path is already registered ----
    const existing = this.notebookManager.getByPath(jupyterPath);

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
        const warningParts: string[] = [
          `[WARNING] Notebook at '${notebookPath}' (id: ${existing.id}) is already the active notebook. ` +
            `DO NOT REACTIVATE AGAIN.`,
        ];
        try {
          const notebook = await this.readNotebook(jupyterPath);
          warningParts.push(`\nNotebook has ${notebook.cells.length} cells.`);
        } catch (error) {
          warningParts.push(
            `\n[WARNING] Could not read notebook summary: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        return warningParts.join("\n");
      }

      infoList.push(
        `[INFO] Reactivating notebook '${existing.entry.name}' (id: ${existing.id}) ` +
        `and deactivating current notebook.`
      );
      this.notebookManager.setCurrentNotebook(existing.id);
      this.kernelService.setActivePath(jupyterPath);

      // Cell count
      try {
        const notebook = await this.readNotebook(jupyterPath);
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
      const exists = await this.checkNotebookExists(jupyterPath);
      if (!exists) {
        return `[ERROR] '${notebookPath}' not found on the Jupyter server. Please check the notebook already exists.`;
      }
    } else if (mode === "create") {
      const exists = await this.checkNotebookExists(jupyterPath);
      if (exists) {
        return (
          `[ERROR] Notebook '${notebookPath}' already exists on the Jupyter server. ` +
          "Create mode requires a new or cleaned path; do not connect to an existing notebook unless the user asks to reuse it."
        );
      }

      try {
        await this.createNotebook(jupyterPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `[ERROR] Could not create notebook '${notebookPath}': ${message}`;
      }

      infoList.push(`[INFO] Created new notebook at '${notebookPath}'.`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("agentNotebookCreated", { detail: { path: jupyterPath } })
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
      const kernel = await this.kernelService.startKernel("python3", jupyterPath);
      resolvedKernelId = kernel.id;
      infoList.push(`[INFO] Started new kernel '${resolvedKernelId}'.`);
    }

    // Register in notebook manager — receives the generated UUID
    const notebookId = this.notebookManager.addNotebook(notebookName, jupyterPath, resolvedKernelId);
    this.notebookManager.setCurrentNotebook(notebookId);
    infoList.push(
      `[INFO] Successfully activated notebook '${notebookName}' (id: ${notebookId}). ` +
      `Use notebookId '${notebookId}' in subsequent tool calls (read_notebook, restart_notebook).`
    );

    // Cell count
    try {
      const notebook = await this.readNotebook(jupyterPath);
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
