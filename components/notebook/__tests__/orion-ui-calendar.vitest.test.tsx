import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrionUiOutputRenderer } from "@/components/notebook/renderers/orion-ui";
import { OutputType, type NotebookOutputType } from "@/lib/types";

afterEach(() => {
  cleanup();
});

function renderPayload(root: unknown, state: Record<string, string> = {}) {
  const value = {
    version: 1,
    id: "ui-calendar-test",
    root,
    state,
    bindings: {},
  };

  const output: NotebookOutputType = {
    output_type: OutputType.DISPLAY_DATA,
    data: { "application/vnd.orion.ui+json": value },
    metadata: {},
  };

  render(
    <OrionUiOutputRenderer
      output={output}
      mimeType="application/vnd.orion.ui+json"
      value={value}
      theme="light"
      trusted
      ansiConverter={{} as never}
      sanitize={(html) => html}
      actions={{ cellIndex: 0, outputIndex: 0 }}
    />,
  );
}

describe("Orion UI calendar rendering", () => {
  it("renders single-date calendar day grid with dropdown caption", () => {
    renderPayload(
      {
        type: "Calendar",
        props: {
          stateKey: "single_calendar",
          label: "Single-date Calendar",
          mode: "single",
          defaultValue: "2026-05-27",
          captionLayout: "dropdown",
          fromYear: 2020,
          toYear: 2035,
          presets: [{ label: "Today", daysOffset: 0 }],
        },
        children: [],
      },
      { single_calendar: "2026-05-27" },
    );

    expect(screen.getByText("Single-date Calendar")).toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(0);
  });

  it("renders single-date picker trigger", () => {
    renderPayload(
      {
        type: "DatePicker",
        props: {
          stateKey: "single_picker",
          label: "Single-date Picker",
          mode: "single",
          defaultValue: "2026-06-15",
          captionLayout: "dropdown",
          fromYear: 2020,
          toYear: 2035,
          presets: [{ label: "Today", daysOffset: 0 }],
        },
        children: [],
      },
      { single_picker: "2026-06-15" },
    );

    expect(screen.getByText("Single-date Picker")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /June 15/i }),
    ).toBeInTheDocument();
  });

  it("jumps the visible month when a preset selects a hidden date", () => {
    renderPayload(
      {
        type: "Calendar",
        props: {
          stateKey: "single_calendar",
          mode: "single",
          captionLayout: "dropdown",
          defaultValue: "2026-05-27",
          presets: [{ label: "Future date", value: "2030-12-25" }],
        },
        children: [],
      },
      { single_calendar: "2026-05-27" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Future date" }));

    expect(screen.getByText(/December\s+2030/i)).toBeInTheDocument();
  });

  it("re-jumps the visible month when re-clicking an already selected preset", () => {
    renderPayload(
      {
        type: "Calendar",
        props: {
          stateKey: "single_calendar",
          mode: "single",
          captionLayout: "buttons",
          defaultValue: "2026-05-27",
          presets: [{ label: "Future date", value: "2030-12-25" }],
        },
        children: [],
      },
      { single_calendar: "2026-05-27" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Future date" }));
    expect(screen.getByText(/December\s+2030/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go to next month" }));
    expect(screen.getByText(/January\s+2031/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Future date" }));
    expect(screen.getByText(/December\s+2030/i)).toBeInTheDocument();
  });
});
