import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useBusinessReportRefreshErrors } from "@/components/business-shell/use-business-report-refresh-errors";
import { INSERT_CHAT_MESSAGE_EVENT } from "@/lib/chat/chat-composer-events";
import { RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME } from "@/lib/notebook/notebook-execution-events";

const NOTEBOOK_CELL_MENTION_EVENT = "orion:mention-notebook-cell";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("useBusinessReportRefreshErrors", () => {
  it("adds the failed cell and a repair prompt to the chat draft", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(NOTEBOOK_CELL_MENTION_EVENT, listener);
    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);

    renderHook(() => useBusinessReportRefreshErrors("analysis.ipynb"));

    window.dispatchEvent(
      new CustomEvent(RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME, {
        detail: {
          cellIndex: 0,
          triggerSource: "refresh-report",
        },
      }),
    );

    window.removeEventListener(NOTEBOOK_CELL_MENTION_EVENT, listener);
    window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: NOTEBOOK_CELL_MENTION_EVENT,
      detail: {
        notebookPath: "analysis.ipynb",
        cellIndex: 0,
      },
    });
    expect(events[1]).toMatchObject({
      type: INSERT_CHAT_MESSAGE_EVENT,
      detail: {
        message:
          "Fix the error in this cell, then run the whole notebook to make sure it completes successfully.",
      },
    });
    expect((events[1] as CustomEvent<{ submit?: boolean }>).detail.submit).toBeUndefined();
  });

  it("ignores non-refresh run-all failures", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(NOTEBOOK_CELL_MENTION_EVENT, listener);
    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    renderHook(() => useBusinessReportRefreshErrors("analysis.ipynb"));

    window.dispatchEvent(
      new CustomEvent(RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME, {
        detail: {
          cellIndex: 1,
          triggerSource: "run-all",
        },
      }),
    );

    window.removeEventListener(NOTEBOOK_CELL_MENTION_EVENT, listener);
    window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    expect(events).toHaveLength(0);
  });
});
