import { describe, expect, it } from "vitest";

import {
  isExportedNotebookCellVisuallyEmpty,
  isHiddenInputCellWithoutVisibleContent,
} from "@/lib/notebook/cell-presentation";
import { CellType } from "@/lib/types";

describe("isHiddenInputCellWithoutVisibleContent", () => {
  it("is true for a visible code cell with no outputs when publish hides inputs", () => {
    expect(
      isHiddenInputCellWithoutVisibleContent({
        cellType: CellType.CODE,
        presentationHideAllCellInputs: true,
        outputCount: 0,
      }),
    ).toBe(true);
  });

  it("is false when the code cell still has outputs", () => {
    expect(
      isHiddenInputCellWithoutVisibleContent({
        cellType: CellType.CODE,
        presentationHideAllCellInputs: true,
        outputCount: 2,
      }),
    ).toBe(false);
  });

  it("does not hide markdown just because publish hides code inputs", () => {
    expect(
      isHiddenInputCellWithoutVisibleContent({
        cellType: CellType.MARKDOWN,
        presentationHideAllCellInputs: true,
        outputCount: 0,
      }),
    ).toBe(false);
  });

  it("keeps queued or invalid cells so their status can still show", () => {
    expect(
      isHiddenInputCellWithoutVisibleContent({
        cellType: CellType.CODE,
        presentationHideAllCellInputs: true,
        outputCount: 0,
        isQueuedForExecution: true,
      }),
    ).toBe(false);
    expect(
      isHiddenInputCellWithoutVisibleContent({
        cellType: CellType.CODE,
        presentationHideAllCellInputs: true,
        outputCount: 0,
        hasValidationIssue: true,
      }),
    ).toBe(false);
  });
});

describe("isExportedNotebookCellVisuallyEmpty", () => {
  it("treats an empty bordered card as visually empty", () => {
    const cell = document.createElement("div");
    cell.className = "notebook-cell";
    cell.innerHTML = '<div class="rounded-lg border"></div>';
    expect(isExportedNotebookCellVisuallyEmpty(cell)).toBe(true);
  });

  it("keeps cells that still have text or media", () => {
    const withText = document.createElement("div");
    withText.textContent = "Autauga County, AL";
    expect(isExportedNotebookCellVisuallyEmpty(withText)).toBe(false);

    const withTable = document.createElement("div");
    withTable.innerHTML = "<table><tr><td></td></tr></table>";
    expect(isExportedNotebookCellVisuallyEmpty(withTable)).toBe(false);
  });
});
