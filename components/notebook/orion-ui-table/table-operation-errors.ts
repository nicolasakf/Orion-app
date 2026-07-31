import type { ExperienceMode } from "@/lib/settings/schema";

import type { OrionTableRequest } from "./types";

export type OrionTableUserAction = OrionTableRequest["action"];

const RUN_CELL_HINT =
  "Run the cell that displays this table. If you restarted the kernel, run it again.";

/** User-facing message when live table actions need the source cell to be executed. */
export function tableNotRegisteredMessage(
  action: OrionTableUserAction,
  experienceMode: ExperienceMode = "pro",
): string {
  if (experienceMode === "business") {
    switch (action) {
      case "fetch":
        return "Refresh this report to sort, filter, or explore this table.";
      case "stats":
        return "Refresh this report to see column details.";
      case "export_csv":
        return "Refresh this report to export or copy this table.";
      case "expression":
        return "Refresh this report before saving this table view.";
      case "filter_value":
        return "Refresh this report before filtering from a selected cell.";
      default:
        return "Refresh this report to interact with this table.";
    }
  }

  switch (action) {
    case "fetch":
      return `This table is showing saved output. ${RUN_CELL_HINT} Then you can sort, filter, search, or change pages.`;
    case "stats":
      return `This table is showing saved output. ${RUN_CELL_HINT} Then you can view column statistics.`;
    case "export_csv":
      return `This table is showing saved output. ${RUN_CELL_HINT} Then you can export or copy the full table.`;
    case "expression":
      return `This table is showing saved output. ${RUN_CELL_HINT} Then you can save the current view expression.`;
    case "filter_value":
      return `This table is showing saved output. ${RUN_CELL_HINT} Then you can filter from selected cells.`;
    default:
      return `This table is showing saved output. ${RUN_CELL_HINT}`;
  }
}

/** User-facing message when no kernel handler is available for table actions. */
export function missingKernelMessage(
  experienceMode: ExperienceMode = "pro",
): string {
  if (experienceMode === "business") {
    return "Connect Orion's runtime, then refresh this report.";
  }

  return `Start the notebook kernel, then ${RUN_CELL_HINT.toLowerCase()}`;
}

/**
 * Converts backend and transport errors into user-facing table action messages.
 * Keeps already-friendly backend text and maps legacy technical errors.
 */
export function formatTableOperationError(
  action: OrionTableUserAction,
  error: unknown,
  experienceMode: ExperienceMode = "pro",
): string {
  if (!(error instanceof Error)) {
    return experienceMode === "business"
      ? "Something went wrong. Refresh this report and try again."
      : "Something went wrong while updating the table. Try running the cell again.";
  }

  const message = error.message.trim();
  if (!message) {
    return experienceMode === "business"
      ? "Something went wrong. Refresh this report and try again."
      : "Something went wrong while updating the table. Try running the cell again.";
  }

  if (/Orion table is no longer registered in the kernel/i.test(message)) {
    return tableNotRegisteredMessage(action, experienceMode);
  }

  if (
    /No active kernel/i.test(message) ||
    /Live table actions require an active Orion kernel/i.test(message)
  ) {
    return missingKernelMessage(experienceMode);
  }

  if (/Timed out waiting for the Orion table backend/i.test(message)) {
    return experienceMode === "business"
      ? "This took too long to respond. Refresh this report and try again."
      : `The table backend did not respond. ${RUN_CELL_HINT}`;
  }

  if (/This table is showing saved output\./i.test(message)) {
    return tableNotRegisteredMessage(action, experienceMode);
  }

  return message;
}
