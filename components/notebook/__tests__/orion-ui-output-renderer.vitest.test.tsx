import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrionUiOutputRenderer } from "@/components/notebook/renderers/orion-ui";
import { OutputType, type NotebookOutputType } from "@/lib/types";

afterEach(() => {
  cleanup();
});

function renderOrionUiOutput({
  value,
  onStateChange = vi.fn(),
  onAction = vi.fn(),
}: {
  value: unknown;
  onStateChange?: (
    key: string,
    value: string | number | boolean,
    outputId?: string,
  ) => void;
  onAction?: (action: unknown) => void;
}) {
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
      actions={{
        cellIndex: 0,
        outputIndex: 0,
        onOrionUiStateChange: onStateChange,
        onOrionUiAction: onAction,
      }}
    />,
  );

  return { onStateChange, onAction };
}

describe("OrionUiOutputRenderer", () => {
  it("renders controls and forwards state changes with the output id", () => {
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-test",
        root: {
          type: "Input",
          props: { label: "Region", stateKey: "region", defaultValue: "west" },
          children: [],
        },
        state: { region: "west" },
        bindings: { region: { kind: "python_state", valueType: "string" } },
      },
    });

    const input = screen.getByLabelText("Region");
    expect(input).toHaveValue("west");
    fireEvent.change(input, { target: { value: "east" } });
    expect(onStateChange).toHaveBeenCalledWith("region", "east", "ui-test");
  });

  it("dispatches declarative button actions", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onAction } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-action",
        root: {
          type: "Button",
          props: { label: "Run", action },
          children: [],
        },
        state: {},
        bindings: {},
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onAction).toHaveBeenCalledWith(action);
  });

  it("renders destructive button variant", () => {
    renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-destructive-button",
        root: {
          type: "Button",
          props: { label: "Delete", variant: "destructive" },
          children: [],
        },
        state: {},
        bindings: {},
      },
    });

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "bg-destructive",
    );
  });

  it("renders primitive class hooks without requiring App View CSS", () => {
    renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-class",
        root: {
          type: "Button",
          props: { label: "Styled", className: "metric-action" },
          children: [],
        },
        state: {},
        bindings: {},
      },
    });

    expect(screen.getByRole("button", { name: "Styled" })).toHaveClass(
      "metric-action",
    );
  });

  it("renders date range slider presets and forwards range changes", () => {
    const onStateChange = vi.fn();
    renderOrionUiOutput({
      onStateChange,
      value: {
        version: 1,
        id: "ui-date-range",
        root: {
          type: "DateRangeSlider",
          props: {
            label: "Analysis window",
            stateKey: "analysis_window",
            defaultValue: '{"from":"2026-05-01","to":"2026-05-07"}',
          },
          children: [],
        },
        state: {
          analysis_window: '{"from":"2026-05-01","to":"2026-05-07"}',
        },
        bindings: {
          analysis_window: { kind: "python_state", valueType: "string" },
        },
      },
    });

    expect(
      screen.getByRole("group", { name: "Analysis window" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "This month" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 7D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90D" })).toBeInTheDocument();
    expect(screen.getByText("7 Days")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "30D" }));

    expect(onStateChange).toHaveBeenCalled();
    const [key, rawValue, outputId] = onStateChange.mock.calls.at(-1) ?? [];
    expect(key).toBe("analysis_window");
    expect(outputId).toBe("ui-date-range");
    const nextRange = JSON.parse(String(rawValue)) as {
      from: string;
      to: string;
    };
    const from = new Date(`${nextRange.from}T00:00:00`);
    const to = new Date(`${nextRange.to}T00:00:00`);
    const dayCount =
      Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    expect(dayCount).toBe(30);
  });
});
