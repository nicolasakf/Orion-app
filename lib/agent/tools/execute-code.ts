/**
 * ExecuteCodeTool - Execute arbitrary Python code in the kernel
 *
 * Sends code directly to the kernel for execution without reading
 * from or writing to a notebook file. Useful for ad-hoc code execution,
 * magic commands, and shell commands (via !).
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { stripAnsi } from "@/lib/shell/terminal-executor";
import type { KernelSidecar } from "../kernel-sidecar";
import type { ExecuteCodeParams } from "./types";
import type { ExecutionToolResult } from "../visual-evidence";

export class ExecuteCodeTool extends BaseTool {
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
   * Execute arbitrary code in the kernel.
   *
   * @param params.code - Python/IPython code to execute
   * @param params.timeoutSeconds - Maximum execution time (default: 60)
   * @returns Collected output text
   */
  async execute(params: ExecuteCodeParams): Promise<string | ExecutionToolResult> {
    const { code, timeoutSeconds } = params;

    if (!code || !code.trim()) {
      return "[No code provided]";
    }

    // Ensure the kernel service points at the current notebook's session
    const notebookPath =
      this.notebookManager.getCurrentNotebookPath() || "notebook.ipynb";
    if (!this.kernelService.setActivePath(notebookPath)) {
      // No session yet — try to start a kernel for this notebook
      try {
        await this.kernelService.startKernel("python3", notebookPath);
      } catch (error) {
        return `[ERROR] No kernel available and failed to start one: ${error instanceof Error ? error.message : String(error)}]`;
      }
    }

    // Wait for kernel to be idle
    try {
      await this.waitForKernelIdle(30000);
    } catch (error) {
      return `[ERROR] ${error instanceof Error ? error.message : String(error)}]`;
    }

    // Execute code and collect outputs
    const timeoutMs = timeoutSeconds * 1000;

    try {
      const result = await this.executeCode(code, timeoutMs);

      if (result.outputs.length === 0 && result.visuals.length === 0) {
        return "[No output generated]";
      }

      const text = stripAnsi(result.outputs.join("\n") || "[Raster output generated]");
      return result.visuals.length > 0 ? { text, visuals: result.visuals } : text;
    } catch (error) {
      return `[ERROR] ${error instanceof Error ? error.message : String(error)}]`;
    }
  }
}
