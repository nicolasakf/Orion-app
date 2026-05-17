import type { KernelService } from "@/lib/kernel/kernel-service";
import type { NotebookOutputType } from "@/lib/types";

/**
 * Result of executing a single cell against the kernel.
 */
export interface CellExecutionResult {
  /** Collected outputs (stream, execute_result, display_data, error). */
  outputs: NotebookOutputType[];
  /** Execution count assigned by the kernel, or null if unavailable. */
  executionCount: number | null;
  /** Whether the execution completed without errors. */
  success: boolean;
  /** Wall-clock duration in milliseconds. */
  duration: number;
  /** Execution start time. */
  startTime: Date;
  /** Execution end time. */
  endTime: Date;
}

/**
 * Callback invoked during execution when a new output is received.
 * Useful for streaming outputs to the UI in real time.
 */
export type OnOutputCallback = (output: NotebookOutputType) => void;

/**
 * Callback invoked when the kernel assigns an execution count.
 */
export type OnExecutionCountCallback = (count: number) => void;

/**
 * Options for executing a single cell.
 */
export interface ExecuteCellOptions {
  /** The KernelService instance to use. */
  kernelService: KernelService;
  /** Source code to execute. */
  source: string;
  /** Optional callback for each output as it arrives. */
  onOutput?: OnOutputCallback;
  /** Optional callback when the kernel assigns an execution count. */
  onExecutionCount?: OnExecutionCountCallback;
}

/**
 * Options for executing a batch of cells.
 */
export interface RunCellsOptions {
  /** The KernelService instance to use. */
  kernelService: KernelService;
  /** Array of { index, source } pairs to execute in order. */
  cells: { index: number; source: string }[];
  /** If true, stop executing remaining cells when one fails. Defaults to true. */
  stopOnError?: boolean;
  /**
   * Called before each cell starts executing.
   * Use this to update UI state (e.g. set cell to RUNNING).
   */
  onCellStart?: (index: number) => void;
  /**
   * Called with streaming output as it arrives from the kernel.
   * Use this to append outputs to the cell in real time.
   */
  onCellOutput?: (index: number, output: NotebookOutputType) => void;
  /**
   * Called when the kernel assigns an execution count to a cell.
   */
  onCellExecutionCount?: (index: number, count: number) => void;
  /**
   * Called after each cell finishes executing (success or failure).
   */
  onCellComplete?: (index: number, result: CellExecutionResult) => void;
}

/**
 * Result of a batch execution.
 */
export interface RunCellsResult {
  /** Whether all cells executed successfully. */
  success: boolean;
  /** Per-cell results, keyed by cell index. */
  results: Map<number, CellExecutionResult>;
}

// ---------------------------------------------------------------------------
// Message-to-output mapping (pure function, no React dependency)
// ---------------------------------------------------------------------------

/**
 * Maps a Jupyter kernel IOPub/reply message to a notebook output object.
 * Returns null for message types that don't produce visible output.
 */
export function mapMessageToOutput(msg: any): NotebookOutputType | null {
  const msgType = msg.header.msg_type;
  const content = msg.content as any;

  switch (msgType) {
    case "stream":
      return {
        output_type: "stream" as any,
        name: content.name,
        text: Array.isArray(content.text) ? content.text : [content.text],
      };

    case "execute_result":
      return {
        output_type: "execute_result" as any,
        execution_count: content.execution_count,
        data: content.data,
        metadata: content.metadata || {},
      };

    case "display_data":
      return {
        output_type: "display_data" as any,
        data: content.data,
        metadata: content.metadata || {},
      };

    case "error":
      return {
        output_type: "error" as any,
        ename: content.ename,
        evalue: content.evalue,
        traceback: content.traceback,
      };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Single cell execution
// ---------------------------------------------------------------------------

/**
 * Execute a single code cell against the kernel.
 *
 * Collects all outputs, tracks execution count and timing, and determines
 * success by checking whether any output is an error.
 *
 * @throws Re-throws kernel/transport errors (dead kernel, disposed, etc.)
 */
export async function executeSingleCell(
  options: ExecuteCellOptions
): Promise<CellExecutionResult> {
  const { kernelService, source, onOutput, onExecutionCount } = options;

  const outputs: NotebookOutputType[] = [];
  let executionCount: number | null = null;
  let hasError = false;

  const startTime = new Date();

  const future = await kernelService.execute(source, (msg) => {
    // Track execution count from execute_input or execute_reply
    if (msg.header.msg_type === "execute_input") {
      const count = (msg.content as any).execution_count;
      if (count != null) {
        executionCount = count;
        onExecutionCount?.(count);
      }
    } else if (msg.header.msg_type === "execute_reply") {
      const count = (msg.content as any).execution_count;
      if (count != null) {
        executionCount = count;
        onExecutionCount?.(count);
      }
      // Check reply status for error detection (more reliable than scanning outputs)
      const status = (msg.content as any).status;
      if (status === "error" || status === "abort") {
        hasError = true;
      }
    }

    // Map message to output and collect
    const output = mapMessageToOutput(msg);
    if (output) {
      outputs.push(output);
      onOutput?.(output);

      // Also detect error from output type as a fallback
      if (output.output_type === "error") {
        hasError = true;
      }
    }
  });

  await future.done;

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  return {
    outputs,
    executionCount,
    success: !hasError,
    duration,
    startTime,
    endTime,
  };
}

// ---------------------------------------------------------------------------
// Batch cell execution
// ---------------------------------------------------------------------------

/**
 * Execute multiple cells sequentially.
 *
 * Mirrors the Jupyter Notebook v7 / JupyterLab behavior:
 * - Cells are executed one at a time, in order.
 * - When `stopOnError` is true (default), an execution error stops remaining cells.
 * - Callbacks allow the UI to update in real time (running state, streaming outputs).
 *
 * @returns A summary with per-cell results and overall success.
 */
export async function runCells(
  options: RunCellsOptions
): Promise<RunCellsResult> {
  const {
    kernelService,
    cells,
    stopOnError = true,
    onCellStart,
    onCellOutput,
    onCellExecutionCount,
    onCellComplete,
  } = options;

  const results = new Map<number, CellExecutionResult>();
  let allSucceeded = true;

  // Wrap batch callbacks so executeSingleCell receives per-cell callbacks
  const makeOutputCb = (idx: number) =>
    onCellOutput ? (output: NotebookOutputType) => onCellOutput(idx, output) : undefined;

  const makeExecCountCb = (idx: number) =>
    onCellExecutionCount ? (count: number) => onCellExecutionCount(idx, count) : undefined;

  for (const { index, source } of cells) {
    onCellStart?.(index);

    try {
      const result = await executeSingleCell({
        kernelService,
        source,
        onOutput: makeOutputCb(index),
        onExecutionCount: makeExecCountCb(index),
      });

      results.set(index, result);
      onCellComplete?.(index, result);

      if (!result.success) {
        allSucceeded = false;
        if (stopOnError) {
          break;
        }
      }
    } catch (error) {
      // Transport-level error (dead kernel, disposed, etc.)
      const endTime = new Date();
      const failResult: CellExecutionResult = {
        outputs: [],
        executionCount: null,
        success: false,
        duration: 0,
        startTime: endTime,
        endTime,
      };
      results.set(index, failResult);
      onCellComplete?.(index, failResult);
      allSucceeded = false;

      if (stopOnError) {
        break;
      }
    }
  }

  return { success: allSucceeded, results };
}
