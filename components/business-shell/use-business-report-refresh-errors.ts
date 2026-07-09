"use client";

import * as React from "react";
import { toast } from "sonner";

import { dispatchInsertChatMessage } from "@/lib/chat/chat-composer-events";
import {
  RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
  type RunAllStoppedOnErrorEventDetail,
} from "@/lib/notebook/notebook-execution-events";

const NOTEBOOK_CELL_MENTION_EVENT = "orion:mention-notebook-cell";
const BUSINESS_REPORT_REFRESH_DRAFT = "Fix the error in this cell.";

/**
 * Adds a failed report cell and a repair prompt to the chat draft after a
 * Business-mode refresh stops on an error. The user chooses whether to submit.
 */
export function useBusinessReportRefreshErrors(
  notebookPath: string,
): void {
  const notebookPathRef = React.useRef(notebookPath);
  notebookPathRef.current = notebookPath;

  React.useEffect(() => {
    const handleRunAllStoppedOnError = (event: Event) => {
      const detail = (event as CustomEvent<RunAllStoppedOnErrorEventDetail>).detail;
      if (detail.triggerSource !== "refresh-report") {
        return;
      }

      const currentNotebookPath = notebookPathRef.current;
      if (currentNotebookPath) {
        window.dispatchEvent(
          new CustomEvent(NOTEBOOK_CELL_MENTION_EVENT, {
            detail: {
              notebookPath: currentNotebookPath,
              cellIndex: detail.cellIndex,
              preview: `Notebook cell ${detail.cellIndex} failed to run.`,
            },
          }),
        );
      }

      toast.error("Couldn't refresh the report", {
        description: "A suggested fix was added to the chat draft.",
      });
      dispatchInsertChatMessage(BUSINESS_REPORT_REFRESH_DRAFT);
    };

    window.addEventListener(
      RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
      handleRunAllStoppedOnError as EventListener,
    );

    return () => {
      window.removeEventListener(
        RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
        handleRunAllStoppedOnError as EventListener,
      );
    };
  }, []);
}
