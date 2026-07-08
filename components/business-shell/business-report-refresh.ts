import type { NotebookCellType, NotebookType } from "@/lib/types";
import { OutputType } from "@/lib/types";

/** Extracts the first error output from a notebook cell, if present. */
export function getNotebookCellErrorOutput(cell: NotebookCellType | undefined): {
  ename: string;
  evalue: string;
  traceback?: string[];
} | null {
  if (!cell?.outputs?.length) {
    return null;
  }

  for (const output of cell.outputs) {
    if (output.output_type !== OutputType.ERROR) {
      continue;
    }

    const ename = output.ename?.trim() ?? "Error";
    const evalue = output.evalue?.trim() ?? "";
    return {
      ename,
      evalue,
      ...(output.traceback?.length ? { traceback: output.traceback } : {}),
    };
  }

  return null;
}

/** Builds the agent prompt used when a business report refresh fails. */
export function buildBusinessReportRefreshFixPrompt(
  cellIndex: number,
  error: { ename: string; evalue: string; traceback?: string[] } | null,
): string {
  const cellLabel = `cell #${cellIndex}`;
  const summary = error
    ? `${error.ename}: ${error.evalue}`
    : "an unknown execution error";
  const tracebackSnippet =
    error?.traceback && error.traceback.length > 0
      ? `\n\nTraceback:\n${error.traceback.join("\n")}`
      : "";

  return `The report failed to refresh at ${cellLabel} (${summary}). Please fix the error, explain what happened in plain language, rerun the affected cells, and refresh the report outputs.${tracebackSnippet}`;
}

/** Reads error context for a notebook cell index. */
export function getNotebookCellErrorContext(
  notebook: NotebookType | null,
  cellIndex: number,
): {
  ename: string;
  evalue: string;
  traceback?: string[];
} | null {
  if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
    return null;
  }

  return getNotebookCellErrorOutput(notebook.cells[cellIndex]);
}
