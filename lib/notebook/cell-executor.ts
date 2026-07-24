import type { KernelService } from "@/lib/kernel/kernel-service";
import { OutputType } from "@/lib/types";
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
  /** Max execution time in milliseconds. Omit for no timeout. */
  timeoutMs?: number;
  /** Interrupt the kernel when `timeoutMs` elapses. Defaults to false. */
  interruptOnTimeout?: boolean;
  /** Optional callback while a timed execution is still running. */
  onProgress?: (progress: { elapsedMs: number; outputCount: number }) => void;
  /** Progress callback cadence in milliseconds. Defaults to 1000. */
  progressIntervalMs?: number;
  /** Optional callback when execution times out. */
  onTimeout?: (elapsedMs: number) => void;
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
  /** Called immediately before a cell starts; may throw to stop that cell. */
  beforeCell?: (index: number) => Promise<void> | void;
  /** Checked between cells; returning false cancels the remaining batch. */
  shouldContinue?: () => boolean;
  /** Max execution time per cell in milliseconds. Omit for no timeout. */
  timeoutMs?: number;
  /** Interrupt the kernel when `timeoutMs` elapses. Defaults to false. */
  interruptOnTimeout?: boolean;
  /** Called while a timed cell execution is still running. */
  onCellProgress?: (
    index: number,
    progress: { elapsedMs: number; outputCount: number }
  ) => void;
  /** Progress callback cadence in milliseconds. Defaults to 1000. */
  progressIntervalMs?: number;
  /** Called when a cell execution times out. */
  onCellTimeout?: (index: number, elapsedMs: number) => void;
}

/**
 * Result of a batch execution.
 */
export interface RunCellsResult {
  /** Whether all cells executed successfully. */
  success: boolean;
  /** Whether execution stopped because `shouldContinue` returned false. */
  cancelled: boolean;
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
        output_type: OutputType.STREAM,
        name: content.name ?? "stdout",
        text: Array.isArray(content.text)
          ? content.text
          : [content.text ?? ""],
      };

    case "execute_result":
      return {
        output_type: OutputType.EXECUTE_RESULT,
        execution_count: content.execution_count,
        data: normalizeOutputData(content.data),
        metadata: content.metadata || {},
      };

    case "display_data":
      return {
        output_type: OutputType.DISPLAY_DATA,
        data: normalizeOutputData(content.data),
        metadata: content.metadata || {},
      };

    case "error":
      return {
        output_type: OutputType.ERROR,
        ename: content.ename,
        evalue: content.evalue,
        traceback: content.traceback,
      };

    default:
      return null;
  }
}

/**
 * Normalize kernel output data to nbformat-compatible structures.
 * Text MIME values become string arrays while binary image payloads stay strings.
 */
function normalizeOutputData(
  data: Record<string, unknown> | undefined
): NotebookOutputType["data"] {
  if (!data) return undefined;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      key === "image/png" ||
      key === "image/jpeg" ||
      key === "image/svg+xml"
    ) {
      result[key] = typeof value === "string" ? value : String(value);
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else if (typeof value === "string") {
      result[key] = [value];
    } else {
      result[key] = value;
    }
  }
  return result as NotebookOutputType["data"];
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
  const {
    kernelService,
    source,
    onOutput,
    onExecutionCount,
    timeoutMs,
    interruptOnTimeout = false,
    onProgress,
    progressIntervalMs = 1000,
    onTimeout,
  } = options;

  const outputs: NotebookOutputType[] = [];
  let executionCount: number | null = null;
  let hasError = false;
  let completed = false;
  let timedOut = false;

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

  const executionPromise = future.done.then(() => {
    completed = true;
  });

  let progressTimer: ReturnType<typeof setInterval> | null = null;
  if (onProgress) {
    progressTimer = setInterval(() => {
      if (!completed) {
        onProgress({
          elapsedMs: Date.now() - startTime.getTime(),
          outputCount: outputs.length,
        });
      }
    }, progressIntervalMs);
  }

  const timeoutPromise =
    timeoutMs == null
      ? null
      : new Promise<void>((_, reject) => {
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
    if (timeoutPromise) {
      await Promise.race([executionPromise, timeoutPromise]);
    } else {
      await executionPromise;
    }
  } catch (error) {
    completed = true;
    if (error instanceof Error && error.message === "timeout") {
      timedOut = true;
      hasError = true;
      onTimeout?.(Date.now() - startTime.getTime());
      if (interruptOnTimeout) {
        try {
          await kernelService.interrupt();
        } catch {
          // The timeout itself is the execution result; interrupt failure should
          // not hide the original timed-out cell state from callers.
        }
      }
    } else {
      hasError = true;
      throw error;
    }
  } finally {
    if (progressTimer !== null) {
      clearInterval(progressTimer);
    }
  }

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  return {
    outputs,
    executionCount,
    success: !hasError && !timedOut,
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
    beforeCell,
    shouldContinue,
    timeoutMs,
    interruptOnTimeout = false,
    onCellProgress,
    progressIntervalMs,
    onCellTimeout,
  } = options;

  const results = new Map<number, CellExecutionResult>();
  let allSucceeded = true;
  let cancelled = false;

  // Wrap batch callbacks so executeSingleCell receives per-cell callbacks
  const makeOutputCb = (idx: number) =>
    onCellOutput ? (output: NotebookOutputType) => onCellOutput(idx, output) : undefined;

  const makeExecCountCb = (idx: number) =>
    onCellExecutionCount ? (count: number) => onCellExecutionCount(idx, count) : undefined;

  for (const { index, source } of cells) {
    if (shouldContinue?.() === false) {
      cancelled = true;
      allSucceeded = false;
      break;
    }

    try {
      await beforeCell?.(index);
      if (shouldContinue?.() === false) {
        cancelled = true;
        allSucceeded = false;
        break;
      }
      onCellStart?.(index);

      const result = await executeSingleCell({
        kernelService,
        source,
        onOutput: makeOutputCb(index),
        onExecutionCount: makeExecCountCb(index),
        timeoutMs,
        interruptOnTimeout,
        onProgress: onCellProgress
          ? (progress) => onCellProgress(index, progress)
          : undefined,
        progressIntervalMs,
        onTimeout: onCellTimeout
          ? (elapsedMs) => onCellTimeout(index, elapsedMs)
          : undefined,
      });

      results.set(index, result);
      onCellComplete?.(index, result);

      if (shouldContinue?.() === false) {
        cancelled = true;
        allSucceeded = false;
        break;
      }

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

      if (shouldContinue?.() === false) {
        cancelled = true;
        break;
      }

      if (stopOnError) {
        break;
      }
    }
  }

  return { success: allSucceeded, cancelled, results };
}
