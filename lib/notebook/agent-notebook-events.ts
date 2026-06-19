import type { NotebookOutputType, CellExecutionInfo } from "@/lib/types";

export const AGENT_NOTEBOOK_EXECUTION_EVENT_NAME =
  "orion:agent-notebook-execution";

export type AgentNotebookExecutionEventDetail =
  | {
      type: "queued";
      notebookPath: string;
      cellIndices: number[];
    }
  | {
      type: "start";
      notebookPath: string;
      cellIndex: number;
      startTime: Date;
    }
  | {
      type: "output";
      notebookPath: string;
      cellIndex: number;
      output: NotebookOutputType;
    }
  | {
      type: "execution-count";
      notebookPath: string;
      cellIndex: number;
      executionCount: number;
    }
  | {
      type: "complete";
      notebookPath: string;
      cellIndex: number;
      executionInfo: CellExecutionInfo;
    };

/** Dispatches an agent notebook execution event when running in the browser. */
export function dispatchAgentNotebookExecutionEvent(
  detail: AgentNotebookExecutionEventDetail
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AgentNotebookExecutionEventDetail>(
      AGENT_NOTEBOOK_EXECUTION_EVENT_NAME,
      { detail }
    )
  );
}
