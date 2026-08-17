import { CellType } from "@/lib/types";

/**
 * True when hiding inputs leaves a cell with no visible body.
 * Those cells still render an empty bordered card, which collapses to a
 * horizontal rule on published pages.
 */
export function isHiddenInputCellWithoutVisibleContent(params: {
  cellType: CellType | string;
  presentationHideAllCellInputs?: boolean;
  isInputHidden?: boolean;
  outputCount: number;
  isQueuedForExecution?: boolean;
  isMetadataEditingMode?: boolean;
  hasValidationIssue?: boolean;
}): boolean {
  const inputHiddenForDisplay =
    !!params.isInputHidden ||
    (params.cellType === CellType.CODE && !!params.presentationHideAllCellInputs);

  if (!inputHiddenForDisplay) return false;
  if (params.isQueuedForExecution) return false;
  if (params.isMetadataEditingMode) return false;
  if (params.hasValidationIssue) return false;
  return params.outputCount === 0;
}

/** True when an exported notebook cell has no remaining visible content. */
export function isExportedNotebookCellVisuallyEmpty(cell: Element): boolean {
  const text = cell.textContent?.replace(/\s+/g, "") ?? "";
  if (text.length > 0) return false;
  return !cell.querySelector("img, canvas, svg, iframe, table, video, picture");
}
