import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBusinessReportRefreshErrors } from "@/components/business-shell/use-business-report-refresh-errors";
import {
  INSERT_CHAT_MESSAGE_EVENT,
  resetAutoFixDedupeKeysForTests,
} from "@/lib/chat/chat-composer-events";
import { RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME } from "@/lib/notebook/notebook-execution-events";
import { CellType, OutputType } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("useBusinessReportRefreshErrors", () => {
  afterEach(() => {
    resetAutoFixDedupeKeysForTests();
  });

  it("auto-submits a fix prompt for refresh-report failures", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);

    const notebook = {
      cells: [
        {
          cell_type: CellType.CODE,
          source: ["raise ValueError('bad')"],
          metadata: {},
          outputs: [
            {
              output_type: OutputType.ERROR,
              ename: "ValueError",
              evalue: "bad",
              traceback: ["ValueError: bad"],
            },
          ],
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    };

    renderHook(() => useBusinessReportRefreshErrors(notebook));

    window.dispatchEvent(
      new CustomEvent(RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME, {
        detail: {
          cellIndex: 0,
          triggerSource: "refresh-report",
        },
      }),
    );

    window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);

    expect(events).toHaveLength(1);
    const detail = (events[0] as CustomEvent<{ message: string; submit?: boolean }>).detail;
    expect(detail.submit).toBe(true);
    expect(detail.message).toContain("cell #0");
    expect(detail.message).toContain("ValueError: bad");
  });

  it("ignores non-refresh run-all failures", () => {
    const events: Event[] = [];
    const listener = (event: Event) => {
      events.push(event);
    };

    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    renderHook(() => useBusinessReportRefreshErrors(null));

    window.dispatchEvent(
      new CustomEvent(RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME, {
        detail: {
          cellIndex: 1,
          triggerSource: "run-all",
        },
      }),
    );

    window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    expect(events).toHaveLength(0);
  });
});
