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
  onStateChange?: (key: string, value: string | number | boolean, outputId?: string) => void;
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
});
