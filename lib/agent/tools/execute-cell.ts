/**
 * ExecuteCellTool - Execute a cell in the current notebook
 *
 * The most complex tool -- reads the cell source from the notebook,
 * sends it to the kernel for execution via the KernelService WebSocket,
 * collects outputs (text, images, errors), writes them back to the
 * notebook file, and returns formatted results.
 *
 * Supports:
 * - Timeout with automatic kernel interrupt
 * - Streaming progress updates
 * - Writing execution outputs back to the .ipynb file
 *
 * Kernel outputs (stream, execute_result, display_data, error) are written
 * to the notebook as proper nbformat structures. Agent-control messages
 * (progress, timeout, completion status) are only returned to the LLM and
 * never written to the notebook file.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { OutputType } from "@/lib/types";
import type { KernelSidecar } from "../kernel-sidecar";
import type {
  ExecuteCellParams,
  NotebookDocument,
  CellOutput,
} from "./types";

/** Max traceback lines to include in the agent log */
const MAX_TRACEBACK_LINES = 30;

export class ExecuteCellTool extends BaseTool {
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
   * Execute one or more cells in the currently active notebook.
   *
   * Cells are executed sequentially in the order provided. Each cell's
   * output is labelled with its index when executing multiple cells.
   *
   * @param params.cellIndices - 0-based indices of the cells to execute
   * @param params.timeoutSeconds - Max execution time per cell (seconds)
   * @param params.stream - When true, emit streaming progress updates during execution
   * @param params.progressInterval - Milliseconds between progress updates when stream is true (clamped 250–10000)
   * @returns Array of output strings for the LLM
   */
  async execute(params: ExecuteCellParams): Promise<string[]> {
    const { cellIndices, timeoutSeconds, stream, progressInterval } = params;
    const normalizedProgressIntervalMs = Math.min(
      Math.max(progressInterval, 250),
      10000
    );

    // Resolve current notebook
    const path = this.notebookManager.getCurrentNotebookPath();
    if (!path) {
      return ["[ERROR] No current notebook is active. Use use_notebook first."];
    }

    // Ensure the kernel service is pointing at this notebook's session
    if (!this.kernelService.setActivePath(path)) {
      return [`[ERROR] No kernel session found for '${path}'. Use use_notebook to start one.`];
    }

    const timeoutMs = timeoutSeconds * 1000;
    const multiCell = cellIndices.length > 1;
    const allOutput: string[] = [];

    for (const cellIndex of cellIndices) {
      // Re-read notebook before each cell so index shifts from prior writes are reflected
      const notebook = await this.readNotebook(path);
      const totalCells = notebook.cells.length;

      // Handle negative indices
      let resolvedIndex = cellIndex;
      if (resolvedIndex < 0) {
        resolvedIndex = totalCells + resolvedIndex;
      }

      if (resolvedIndex < 0 || resolvedIndex >= totalCells) {
        allOutput.push(
          `[Cell ${cellIndex}] Out of range. Notebook has ${totalCells} cells.`
        );
        continue;
      }

      const cell = notebook.cells[resolvedIndex];
      if (cell.cell_type !== "code") {
        allOutput.push(
          `[Cell ${resolvedIndex}] Not a code cell (type: ${cell.cell_type}).`
        );
        continue;
      }

      const codeToExecute = this.normalizeCellSource(cell.source);
      if (!codeToExecute.trim()) {
        continue;
      }

      // Wait for kernel to be idle before each cell
      try {
        await this.waitForKernelIdle(30000);
      } catch (error) {
        allOutput.push(
          `[Cell ${resolvedIndex}] Cannot execute: ${error instanceof Error ? error.message : String(error)}`
        );
        break;
      }

      // Execute the code, capturing kernel outputs and agent log separately
      const { kernelOutputs, agentLog } = await this.executeForCell(
        codeToExecute,
        timeoutMs,
        stream,
        normalizedProgressIntervalMs
      );

      // Write only kernel outputs back to the notebook file
      try {
        await this.writeOutputsToNotebook(path, notebook, resolvedIndex, kernelOutputs);
      } catch (error) {
        agentLog.push(
          `[WARNING] Failed to write outputs to notebook: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (multiCell) {
        const cellOutput = agentLog.length > 0 ? agentLog : ["[No output generated]"];
        allOutput.push(`[Cell ${resolvedIndex}]`, ...cellOutput);
      } else {
        allOutput.push(...agentLog);
      }
    }

    const finalOutput = allOutput.length > 0 ? allOutput : ["[No output generated]"];
    const joined = finalOutput.join("\n");
    const guarded = this.truncateOutput(joined);
    return guarded === joined ? finalOutput : [guarded];
  }

  /**
   * Execute code and capture outputs in two forms:
   * - kernelOutputs: proper nbformat CellOutput structures for writing to the notebook.
   *   Contains only what the kernel actually produced (stream, execute_result,
   *   display_data, error). Never contains agent-generated status or control strings.
   * - agentLog: human-readable strings for the LLM, which may also include
   *   progress updates, timeout notices, and completion status.
   */
  private async executeForCell(
    code: string,
    timeoutMs: number,
    stream: boolean,
    progressIntervalMs: number
  ): Promise<{ kernelOutputs: CellOutput[]; agentLog: string[] }> {
    const kernelOutputs: CellOutput[] = [];
    const agentLog: string[] = [];
    const startTime = Date.now();
    let completed = false;
    let outputCount = 0;

    const executionFuture = await this.kernelService.execute(code, (msg) => {
      const msgType = msg.header?.msg_type;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const prefix = stream ? `[${elapsed}s] ` : "";

      switch (msgType) {
        case "stream": {
          const text = msg.content?.text;
          if (text) {
            const textStr =
              typeof text === "string" ? text : (text as string[]).join("");
            kernelOutputs.push({
              output_type: OutputType.STREAM,
              name: (msg.content?.name as string) ?? "stdout",
              text: [textStr],
            });
            agentLog.push(`${prefix}${textStr}`);
            outputCount++;
          }
          break;
        }
        case "execute_result": {
          const data = msg.content?.data as Record<string, unknown> | undefined;
          const execCount = msg.content?.execution_count as number | undefined;
          if (data) {
            kernelOutputs.push({
              output_type: OutputType.EXECUTE_RESULT,
              execution_count: execCount,
              data: this.normalizeOutputData(data),
              metadata: (msg.content?.metadata as Record<string, unknown>) ?? {},
            });
            this.appendDataToAgentLog(data, agentLog, prefix);
            outputCount++;
          }
          break;
        }
        case "display_data": {
          const data = msg.content?.data as Record<string, unknown> | undefined;
          if (data) {
            kernelOutputs.push({
              output_type: OutputType.DISPLAY_DATA,
              data: this.normalizeOutputData(data),
              metadata: (msg.content?.metadata as Record<string, unknown>) ?? {},
            });
            this.appendDataToAgentLog(data, agentLog, prefix);
            outputCount++;
          }
          break;
        }
        case "error": {
          const ename = (msg.content?.ename as string) || "Error";
          const evalue = (msg.content?.evalue as string) || "";
          const traceback = (msg.content?.traceback as string[]) || [];
          kernelOutputs.push({
            output_type: OutputType.ERROR,
            ename,
            evalue,
            traceback,
          });
          const truncated = traceback.slice(-MAX_TRACEBACK_LINES);
          agentLog.push(
            `${prefix}[ERROR: ${ename}: ${evalue}]\n${truncated.join("\n")}`
          );
          outputCount++;
          break;
        }
        case "execute_reply": {
          completed = true;
          break;
        }
      }
    });

    const executionPromise = executionFuture.done.then(() => {
      completed = true;
    });

    // Emit periodic progress updates to the agent log only (not the notebook)
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    if (stream) {
      progressTimer = setInterval(() => {
        if (!completed) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          agentLog.push(
            `[PROGRESS: ${elapsed}s elapsed, ${outputCount} outputs so far]`
          );
        }
      }, progressIntervalMs);
    }

    // Race between execution and timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (!completed) {
          reject(new Error("timeout"));
        }
      }, timeoutMs);

      executionPromise.finally(() => {
        clearTimeout(timeoutHandle);
      });
    });

    try {
      await Promise.race([executionPromise, timeoutPromise]);
      completed = true;
      if (stream) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        agentLog.push(`[COMPLETED in ${elapsed}s]`);
      }
    } catch (error) {
      completed = true;
      if (error instanceof Error && error.message === "timeout") {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        agentLog.push(`[TIMEOUT at ${elapsed}s: Cancelling execution]`);
        try {
          await this.kernelService.interrupt();
          agentLog.push("[Sent interrupt signal to kernel]");
        } catch {
          agentLog.push("[Failed to interrupt kernel]");
        }
      }
    } finally {
      if (progressTimer !== null) {
        clearInterval(progressTimer);
      }
    }

    return { kernelOutputs, agentLog };
  }

  /**
   * Normalize kernel output data to nbformat-compatible structure.
   * Kernel messages may send text-type fields as plain strings; nbformat
   * expects string arrays. Binary fields (image/png etc.) stay as strings.
   */
  private normalizeOutputData(
    data: Record<string, unknown>
  ): CellOutput["data"] {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (
        key === "image/png" ||
        key === "image/jpeg" ||
        key === "image/svg+xml"
      ) {
        // Binary/base64 data stays as a single string
        result[key] = typeof value === "string" ? value : String(value);
      } else if (Array.isArray(value)) {
        result[key] = value;
      } else if (typeof value === "string") {
        result[key] = [value];
      } else {
        result[key] = value;
      }
    }
    return result as CellOutput["data"];
  }

  /**
   * Append the human-readable portion of kernel output data to the agent log.
   */
  private appendDataToAgentLog(
    data: Record<string, unknown>,
    agentLog: string[],
    prefix: string
  ): void {
    if (data["text/plain"]) {
      const plain = data["text/plain"];
      const textStr = Array.isArray(plain)
        ? plain.join("")
        : typeof plain === "string"
          ? plain
          : String(plain);
      agentLog.push(`${prefix}${textStr}`);
    } else if (data["image/png"]) {
      agentLog.push(`${prefix}[Image: PNG]`);
    } else if (data["image/svg+xml"]) {
      agentLog.push(`${prefix}[Image: SVG]`);
    } else if (data["text/html"]) {
      agentLog.push(`${prefix}[HTML output]`);
    }
  }

  /**
   * Write genuine kernel outputs back to the notebook file.
   * Only stores actual CellOutput structures produced by the kernel.
   * Agent-generated status and control messages are never written here.
   */
  private async writeOutputsToNotebook(
    path: string,
    notebook: NotebookDocument,
    cellIndex: number,
    kernelOutputs: CellOutput[]
  ): Promise<void> {
    const cell = notebook.cells[cellIndex];
    if (cell.cell_type !== "code") return;

    cell.outputs = kernelOutputs;

    // Use execution_count from the execute_result message if the kernel provided one
    const execResult = kernelOutputs.find(
      (o) => o.output_type === OutputType.EXECUTE_RESULT
    );
    if (execResult?.execution_count != null) {
      cell.execution_count = execResult.execution_count;
    } else {
      // Fall back to max existing count + 1
      let maxCount = 0;
      for (const c of notebook.cells) {
        if (c.cell_type === "code" && c.execution_count != null) {
          maxCount = Math.max(maxCount, c.execution_count);
        }
      }
      cell.execution_count = maxCount + 1;
    }

    await this.writeNotebook(path, notebook);
  }
}
