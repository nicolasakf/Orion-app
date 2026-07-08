import { describe, expect, it } from "vitest";

import {
  buildBusinessReportRefreshFixPrompt,
  getNotebookCellErrorContext,
  getNotebookCellErrorOutput,
} from "@/components/business-shell/business-report-refresh";
import { CellType, OutputType, type NotebookCellType } from "@/lib/types";

function makeErrorCell(
  ename = "ValueError",
  evalue = "invalid literal",
): NotebookCellType {
  return {
    cell_type: CellType.CODE,
    source: ["raise ValueError('invalid literal')"],
    metadata: {},
    outputs: [
      {
        output_type: OutputType.ERROR,
        ename,
        evalue,
        traceback: ["Traceback (most recent call last):", `${ename}: ${evalue}`],
      },
    ],
  };
}

describe("getNotebookCellErrorOutput", () => {
  it("returns the first error output from a cell", () => {
    const cell = makeErrorCell();
    expect(getNotebookCellErrorOutput(cell)).toEqual({
      ename: "ValueError",
      evalue: "invalid literal",
      traceback: ["Traceback (most recent call last):", "ValueError: invalid literal"],
    });
  });

  it("returns null when the cell has no error output", () => {
    expect(
      getNotebookCellErrorOutput({
        cell_type: CellType.CODE,
        source: ["1 + 1"],
        metadata: {},
        outputs: [],
      }),
    ).toBeNull();
  });
});

describe("buildBusinessReportRefreshFixPrompt", () => {
  it("includes cell index, summary, and traceback", () => {
    const prompt = buildBusinessReportRefreshFixPrompt(2, {
      ename: "ValueError",
      evalue: "invalid literal",
      traceback: ["Traceback (most recent call last):", "ValueError: invalid literal"],
    });

    expect(prompt).toContain("cell #2");
    expect(prompt).toContain("ValueError: invalid literal");
    expect(prompt).toContain("Traceback:");
  });
});

describe("getNotebookCellErrorContext", () => {
  it("reads error context from a notebook cell index", () => {
    const notebook = {
      cells: [makeErrorCell()],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    };

    expect(getNotebookCellErrorContext(notebook, 0)?.ename).toBe("ValueError");
    expect(getNotebookCellErrorContext(notebook, 99)).toBeNull();
  });
});
