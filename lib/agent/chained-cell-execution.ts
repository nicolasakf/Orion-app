/**
 * Chained cell execution for the notebook mutation tools.
 *
 * Writing a cell and running it is one intent but was two tool calls, and with
 * one model step per tool call the second one re-sent the entire prompt to emit
 * roughly a hundred tokens. In session 1786825713795 that pattern accounted for
 * $5.53 of a $13.70 run. Running the cells here keeps the step accounting
 * unchanged — the model still sees one call and one result.
 *
 * Lives outside `assistant-provider.tsx` so the merge, gating, and index rules
 * can be tested without a React tree.
 */

import { parseInsertedRange } from "./tools/insert-cell";
import type {
  ExecuteCellParams,
  InsertCellParams,
  OverwriteCellSourceParams,
} from "./tools/types";
import { isExecutionToolResult, type ExecutionToolResult } from "./visual-evidence";

/** Per-cell timeout used when a mutation tool runs its cells without being told one. */
export const CHAINED_EXECUTION_DEFAULT_TIMEOUT_SECONDS = 120;

/** Returned instead of output when the active mode withholds cell execution. */
export const CHAINED_EXECUTION_BLOCKED_NOTE =
  "Cells were written but not run: code execution is unavailable in this interaction mode. Tell the user which cells to run.";

/** The `execute_cell` surface a chained run depends on. */
export interface ChainedCellExecutor {
  execute(params: ExecuteCellParams): Promise<string[] | ExecutionToolResult>;
}

/**
 * Run cells a mutation tool just wrote and merge the output into its result.
 *
 * @param mutationResult - Raw string returned by the insert or edit, used as the
 *   prefix of the merged result
 * @param cellIndices - Cells to run, already resolved to their post-mutation
 *   positions
 * @param executionAllowed - False when the active mode withholds `execute_cell`
 */
async function runChainedCellExecution(options: {
  executor: ChainedCellExecutor;
  mutationResult: string;
  cellIndices: number[];
  timeoutSeconds?: number;
  executionAllowed: boolean;
}): Promise<string | ExecutionToolResult> {
  const { executor, mutationResult, cellIndices, timeoutSeconds, executionAllowed } = options;

  if (!executionAllowed) {
    return `${mutationResult}\n\n${CHAINED_EXECUTION_BLOCKED_NOTE}`;
  }

  const executionResult = await executor.execute({
    cellIndices,
    timeoutSeconds: timeoutSeconds ?? CHAINED_EXECUTION_DEFAULT_TIMEOUT_SECONDS,
    stream: false,
    progressInterval: 1000,
  });

  const executionText = isExecutionToolResult(executionResult)
    ? executionResult.text
    : String(executionResult);
  const mergedText = `${mutationResult}\n\n${executionText}`;

  return isExecutionToolResult(executionResult)
    ? { ...executionResult, text: mergedText }
    : mergedText;
}

/**
 * Run the code cells an `insert_cell` call just created, when it asked for it.
 *
 * @param insertResult - Raw string returned by the insert, passed through
 *   unchanged when nothing needs to run
 */
export async function runInsertedCellsIfRequested(
  executor: ChainedCellExecutor,
  params: InsertCellParams,
  insertResult: string,
  executionAllowed: boolean
): Promise<string | ExecutionToolResult> {
  if (!params.execute) return insertResult;

  const range = parseInsertedRange(insertResult);
  if (!range) return insertResult;

  // Markdown cells have nothing to run, so only code cells reach the kernel.
  const cellIndices = params.cells
    .map((cell, offset) => ({ cell, index: range.startIndex + offset }))
    .filter(({ cell }) => cell.cellType === "code")
    .map(({ index }) => index);

  if (cellIndices.length === 0) {
    return `${insertResult}\n\nNothing to execute: all inserted cells are markdown.`;
  }

  return runChainedCellExecution({
    executor,
    mutationResult: insertResult,
    cellIndices,
    timeoutSeconds: params.timeoutSeconds,
    executionAllowed,
  });
}

/**
 * Re-run the cells an `overwrite_cell_source` call just edited, when asked.
 *
 * Fixing a cell and seeing the result is the most frequent loop in a session, so
 * it gets the same single-call treatment as insert. Unlike insert, the params
 * carry no cell type, so markdown cells stay in the list and `execute_cell`
 * reports them as non-code — an accurate note, and cheaper than re-reading the
 * notebook to filter cells the model should not have sent.
 *
 * @param editResult - Raw string returned by the edit, passed through unchanged
 *   when nothing needs to run
 */
export async function runEditedCellsIfRequested(
  executor: ChainedCellExecutor,
  params: OverwriteCellSourceParams,
  editResult: string,
  executionAllowed: boolean
): Promise<string | ExecutionToolResult> {
  if (!params.execute) return editResult;

  // The same index may appear twice (last newSource wins), so run each once.
  const cellIndices = Array.from(new Set(params.cells.map((cell) => cell.cellIndex))).sort(
    (a, b) => a - b
  );

  if (cellIndices.length === 0) return editResult;

  return runChainedCellExecution({
    executor,
    mutationResult: editResult,
    cellIndices,
    timeoutSeconds: params.timeoutSeconds,
    executionAllowed,
  });
}
