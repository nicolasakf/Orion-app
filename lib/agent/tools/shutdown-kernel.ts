/**
 * ShutdownKernelTool - Shut down one or more running Jupyter kernels by ID
 *
 * Terminates each kernel process on the Jupyter server and cleans up any
 * notebooks in the NotebookManager that were backed by those kernels.
 * Kernels are shut down concurrently; per-kernel errors are collected and
 * reported without stopping the remaining shutdowns.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { ShutdownKernelParams } from "./types";

export class ShutdownKernelTool extends BaseTool {
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
   * Shut down one or more running kernels by their IDs.
   *
   * @param params.kernelIds - IDs of the kernels to shut down (from list_kernels)
   * @returns Status message summarising successes and any errors
   */
  async execute(params: ShutdownKernelParams): Promise<string> {
    const kernelIds = params.kernelIds.map((id) => id.trim()).filter(Boolean);

    if (kernelIds.length === 0) {
      return "[ERROR] At least one kernelId is required.";
    }

    const succeeded: string[] = [];
    const errors: string[] = [];
    const allRemovedNotebooks: string[] = [];

    await Promise.all(
      kernelIds.map(async (kernelId) => {
        const removedNotebooks = this.notebookManager.removeByKernelId(kernelId);

        try {
          await this.kernelService.shutdownKernelById(kernelId);
          succeeded.push(kernelId);
          allRemovedNotebooks.push(...removedNotebooks);
        } catch (error) {
          errors.push(
            `'${kernelId}': ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );

    const lines: string[] = [];

    if (succeeded.length > 0) {
      lines.push(`Shut down ${succeeded.length} kernel(s): ${succeeded.join(", ")}.`);
    }
    if (allRemovedNotebooks.length > 0) {
      lines.push(`Disconnected notebooks: ${allRemovedNotebooks.join(", ")}.`);
    }
    if (errors.length > 0) {
      lines.push(`[ERROR] Failed to shut down ${errors.length} kernel(s): ${errors.join("; ")}`);
    }

    return lines.join(" ");
  }
}
