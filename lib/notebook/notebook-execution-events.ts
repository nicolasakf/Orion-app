/** Action that started a run-all batch (used to anchor the go-to-error popover). */
export type RunAllTriggerSource = "run-all" | "refresh-report";

export const RUN_ALL_CELLS_EVENT_NAME = "runAllCells";

export interface RunAllCellsEventDetail {
  stopOnError?: boolean;
  triggerSource?: RunAllTriggerSource;
}

export const RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME =
  "orion:run-all-stopped-on-error";

export interface RunAllStoppedOnErrorEventDetail {
  cellIndex: number;
  triggerSource: RunAllTriggerSource;
}

export const SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME =
  "orion:scroll-to-notebook-cell";

export interface ScrollToNotebookCellEventDetail {
  cellIndex: number;
}
