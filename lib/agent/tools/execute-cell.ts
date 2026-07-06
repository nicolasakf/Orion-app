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
import { dispatchAgentNotebookExecutionEvent } from "@/lib/notebook/agent-notebook-events";
import {
  runCells,
  type CellExecutionResult,
} from "@/lib/notebook/cell-executor";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { CellExecutionStatus, OutputType } from "@/lib/types";
import type { KernelSidecar } from "../kernel-sidecar";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type {
  ExecuteCellParams,
  NotebookDocument,
  CellOutput,
} from "./types";
import type { AgentVisualOutput, ExecutionToolResult } from "../visual-evidence";

/** Max traceback lines to include in the agent log */
const MAX_TRACEBACK_LINES = 30;

type MutableRecord = Record<string, unknown>;

function isMutableRecord(value: unknown): value is MutableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface AgentCellExecutionResult extends CellExecutionResult {
  kernelOutputs: CellOutput[];
  agentLog: string[];
}

export class ExecuteCellTool extends BaseTool {
  private notebookManager: NotebookManager;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    notebookManager: NotebookManager,
    snapshotProvider?: OpenDocumentSnapshotProvider | null
  ) {
    super(kernelService, sidecar, snapshotProvider);
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
  async execute(params: ExecuteCellParams): Promise<string[] | ExecutionToolResult> {
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
    const visuals: AgentVisualOutput[] = [];
    const notebook = await this.readNotebook(path);
    const cellsToRun: { index: number; source: string }[] = [];

    for (const cellIndex of cellIndices) {
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

      cellsToRun.push({ index: resolvedIndex, source: codeToExecute });
    }

    if (cellsToRun.length > 0) {
      dispatchAgentNotebookExecutionEvent({
        type: "queued",
        notebookPath: path,
        cellIndices: cellsToRun.map((cell) => cell.index),
      });
    }

    const agentLogs = new Map<number, string[]>();
    const cellStartTimes = new Map<number, Date>();
    const results = new Map<number, AgentCellExecutionResult>();

    await runCells({
      kernelService: this.kernelService,
      cells: cellsToRun,
      stopOnError: false,
      timeoutMs,
      interruptOnTimeout: true,
      progressIntervalMs: normalizedProgressIntervalMs,

      beforeCell: async (resolvedIndex) => {
        try {
          await this.waitForKernelIdle(30000);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          agentLogs.set(resolvedIndex, [
            `[Cell ${resolvedIndex}] Cannot execute: ${message}`,
          ]);
          throw error;
        }
      },

      onCellStart: (resolvedIndex) => {
        const startTime = new Date();
        cellStartTimes.set(resolvedIndex, startTime);
        agentLogs.set(resolvedIndex, []);
        dispatchAgentNotebookExecutionEvent({
          type: "start",
          notebookPath: path,
          cellIndex: resolvedIndex,
          startTime,
        });
      },

      onCellExecutionCount: (resolvedIndex, executionCount) => {
        dispatchAgentNotebookExecutionEvent({
          type: "execution-count",
          notebookPath: path,
          cellIndex: resolvedIndex,
          executionCount,
        });
      },

      onCellOutput: (resolvedIndex, output) => {
        const log = agentLogs.get(resolvedIndex) ?? [];
        const elapsed = this.getElapsedSeconds(cellStartTimes.get(resolvedIndex));
        const prefix = stream ? `[${elapsed}s] ` : "";
        this.appendOutputToAgentLog(output, log, prefix);
        agentLogs.set(resolvedIndex, log);
        dispatchAgentNotebookExecutionEvent({
          type: "output",
          notebookPath: path,
          cellIndex: resolvedIndex,
          output,
        });
      },

      onCellProgress: stream
        ? (resolvedIndex, progress) => {
            const log = agentLogs.get(resolvedIndex) ?? [];
            log.push(
              `[PROGRESS: ${(progress.elapsedMs / 1000).toFixed(1)}s elapsed, ${progress.outputCount} outputs so far]`
            );
            agentLogs.set(resolvedIndex, log);
          }
        : undefined,

      onCellTimeout: (resolvedIndex, elapsedMs) => {
        const log = agentLogs.get(resolvedIndex) ?? [];
        log.push(
          `[TIMEOUT at ${(elapsedMs / 1000).toFixed(1)}s: Cancelling execution]`
        );
        log.push("[Sent interrupt signal to kernel]");
        agentLogs.set(resolvedIndex, log);
      },

      onCellComplete: (resolvedIndex, result) => {
        const log = agentLogs.get(resolvedIndex) ?? [];
        if (stream) {
          log.push(`[COMPLETED in ${(result.duration / 1000).toFixed(1)}s]`);
        }
        const executionResult: AgentCellExecutionResult = {
          ...result,
          kernelOutputs: result.outputs,
          agentLog: log,
        };
        results.set(resolvedIndex, executionResult);
        dispatchAgentNotebookExecutionEvent({
          type: "complete",
          notebookPath: path,
          cellIndex: resolvedIndex,
          executionInfo: this.buildExecutionInfo(executionResult),
        });
      },
    });

    for (const { index: resolvedIndex } of cellsToRun) {
      const executionResult = results.get(resolvedIndex);
      if (!executionResult) {
        const missingLog = agentLogs.get(resolvedIndex);
        if (missingLog?.length) {
          allOutput.push(...missingLog);
        }
        continue;
      }
      const { agentLog } = executionResult;

      executionResult.kernelOutputs.forEach((output, outputIndex) => {
        const data = output.data ?? {};
        for (const mimeType of ["image/png", "image/jpeg"] as const) {
          const value = data[mimeType];
          const raw = Array.isArray(value) ? value.join("") : value;
          if (typeof raw !== "string") continue;
          const normalized = raw.replace(/\s/g, "");
          visuals.push({
            visualId: crypto.randomUUID(),
            mimeType,
            data: normalized,
            source: "execute_cell",
            cellIndex: resolvedIndex,
            outputIndex,
            byteLength: Math.floor((normalized.length * 3) / 4),
          });
        }
      });

      // Write only kernel outputs back to the notebook file
      try {
        await this.writeExecutionResultToNotebook(
          path,
          notebook,
          resolvedIndex,
          executionResult
        );
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
    const textOutput = guarded === joined ? finalOutput : [guarded];
    if (visuals.length > 0) {
      return { text: textOutput.join("\n"), visuals };
    }
    return textOutput;
  }

  /**
   * Append the human-readable portion of kernel output data to the agent log.
   */
  private appendOutputToAgentLog(
    output: CellOutput,
    agentLog: string[],
    prefix: string
  ): void {
    if (output.output_type === "stream") {
      const text = Array.isArray(output.text)
        ? output.text.join("")
        : (output.text ?? "");
      if (text) agentLog.push(`${prefix}${text}`);
      return;
    }

    if (output.output_type === "error") {
      const traceback = (output.traceback ?? []).slice(-MAX_TRACEBACK_LINES);
      agentLog.push(
        `${prefix}[ERROR: ${output.ename ?? "Error"}: ${output.evalue ?? ""}]\n${traceback.join("\n")}`
      );
      return;
    }

    const data = output.data ?? {};
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
    } else if (data["image/jpeg"]) {
      agentLog.push(`${prefix}[Image: JPEG]`);
    } else if (data["image/svg+xml"]) {
      agentLog.push(`${prefix}[Image: SVG]`);
    } else if (data["text/html"]) {
      agentLog.push(`${prefix}[HTML output]`);
    }
  }

  /** Builds Orion execution metadata from a shared cell execution result. */
  private buildExecutionInfo(
    executionResult: Pick<
      AgentCellExecutionResult,
      "success" | "startTime" | "endTime" | "duration"
    >
  ) {
    return {
      status: executionResult.success
        ? CellExecutionStatus.SUCCESS
        : CellExecutionStatus.ERROR,
      startTime: executionResult.startTime,
      endTime: executionResult.endTime,
      duration: executionResult.duration,
      lastExecuted: executionResult.endTime,
      statistics: {
        wallTime: executionResult.duration,
      },
    };
  }

  /** Returns elapsed seconds for streamed log prefixes. */
  private getElapsedSeconds(startTime: Date | undefined): string {
    if (!startTime) return "0.0";
    return ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
  }

  /**
   * Write genuine kernel outputs, execution count, and Orion execution metadata
   * back to the notebook file. Agent-generated status and control messages are
   * never stored as notebook outputs.
   */
  private async writeExecutionResultToNotebook(
    path: string,
    notebook: NotebookDocument,
    cellIndex: number,
    executionResult: AgentCellExecutionResult
  ): Promise<void> {
    const cell = notebook.cells[cellIndex];
    if (cell.cell_type !== "code") return;

    cell.outputs = executionResult.kernelOutputs;

    // Prefer the kernel-assigned count from execute_input/reply/result messages.
    const execResult = executionResult.kernelOutputs.find(
      (o) => o.output_type === OutputType.EXECUTE_RESULT
    );
    if (executionResult.executionCount != null) {
      cell.execution_count = executionResult.executionCount;
    } else if (execResult?.execution_count != null) {
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

    const metadata: MutableRecord = cell.metadata ?? {};
    const orion = isMutableRecord(metadata.orion) ? metadata.orion : {};
    const cellState = isMutableRecord(orion.cellState) ? orion.cellState : {};

    cell.metadata = {
      ...metadata,
      orion: {
        ...orion,
        cellState: {
          ...cellState,
          executionInfo: this.buildExecutionInfo(executionResult),
        },
      },
    };

    await this.writeNotebook(path, notebook);
  }
}
