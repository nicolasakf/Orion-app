"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  buildBusinessErrorDedupeKey,
  dispatchSubmitChatMessage,
} from "@/lib/chat/chat-composer-events";
import {
  RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
  type RunAllStoppedOnErrorEventDetail,
} from "@/lib/notebook/notebook-execution-events";
import type { NotebookType } from "@/lib/types";

import {
  buildBusinessReportRefreshFixPrompt,
  getNotebookCellErrorContext,
} from "./business-report-refresh";

/** Listens for refresh-report failures and auto-submits a fix request to the agent. */
export function useBusinessReportRefreshErrors(
  notebook: NotebookType | null,
): void {
  const notebookRef = React.useRef(notebook);
  notebookRef.current = notebook;

  React.useEffect(() => {
    const handleRunAllStoppedOnError = (event: Event) => {
      const detail = (event as CustomEvent<RunAllStoppedOnErrorEventDetail>).detail;
      if (detail.triggerSource !== "refresh-report") {
        return;
      }

      const error = getNotebookCellErrorContext(notebookRef.current, detail.cellIndex);
      const dedupeKey = buildBusinessErrorDedupeKey(
        detail.cellIndex,
        error?.ename,
        error?.evalue,
      );
      const prompt = buildBusinessReportRefreshFixPrompt(detail.cellIndex, error);

      toast.error("Couldn't refresh the report", {
        description: "Orion is working on fixing the problem.",
      });
      dispatchSubmitChatMessage(prompt, { dedupeKey });
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
