import { describe, expect, it } from "vitest";

import { RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME } from "@/lib/notebook/notebook-execution-events";

describe("notebook run-all stopped-on-error trigger sources", () => {
  it("allows business refresh failures to be distinguished from pro run-all", () => {
    const events: Array<CustomEvent<{ cellIndex: number; triggerSource: string }>> = [];
    const listener = (event: Event) => {
      events.push(
        event as CustomEvent<{ cellIndex: number; triggerSource: string }>,
      );
    };

    window.addEventListener(
      RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
      listener as EventListener,
    );

    window.dispatchEvent(
      new CustomEvent(RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME, {
        detail: { cellIndex: 3, triggerSource: "refresh-report" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME, {
        detail: { cellIndex: 3, triggerSource: "run-all" },
      }),
    );

    window.removeEventListener(
      RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
      listener as EventListener,
    );

    const refreshEvents = events.filter(
      (event) => event.detail.triggerSource === "refresh-report",
    );
    const runAllEvents = events.filter(
      (event) => event.detail.triggerSource === "run-all",
    );

    expect(refreshEvents).toHaveLength(1);
    expect(runAllEvents).toHaveLength(1);
  });
});
