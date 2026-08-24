import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ToolInvocationCard } from "./tool-invocation-card";
import { SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME } from "@/lib/notebook/notebook-execution-events";

describe("ToolInvocationCard", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("shows a cancelled icon instead of a pending spinner for interrupted tools", () => {
    const { container } = render(
      <ToolInvocationCard
        toolName="bash"
        args={{ command: "sleep 30" }}
        result={{ error: "cancelled_by_user", durationMs: 1_500 }}
        state="output-error"
        errorText="cancelled_by_user"
      />
    );

    expect(screen.getByLabelText("Cancelled")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("shows compact notebook cell source deltas and expandable diffs", () => {
    render(
      <ToolInvocationCard
        toolName="overwrite_cell_source"
        args={{ cells: [{ cellIndex: 1, newSource: "x = 2" }] }}
        result={[
          "Cell 1 overwritten successfully!",
          "",
          "Cell source changes:",
          "Cell 1: +1 -1 lines",
          "",
          "Cell 1 diff:",
          "",
          "```diff",
          "--- old",
          "+++ new",
          "-x = 1",
          "+x = 2",
          "```",
        ].join("\n")}
        state="output-available"
      />
    );

    expect(screen.getByText("Cell 1")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Edited 1 cell"));

    expect(screen.getByText(/-x = 1/)).toBeInTheDocument();
    expect(screen.getByText(/\+x = 2/)).toBeInTheDocument();
  });

  it("dispatches notebook cell navigation when a source delta chip is clicked", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(
      <ToolInvocationCard
        toolName="delete_cell"
        args={{ cellIndices: [3] }}
        result={[
          "Cell 3 (code) deleted successfully.",
          "",
          "Cell source changes:",
          "Cell 3: +0 -2 lines",
          "",
          "Cell 3 diff:",
          "",
          "```diff",
          "--- old",
          "+++ new",
          "-a = 1",
          "-b = 2",
          "```",
        ].join("\n")}
        state="output-available"
      />
    );

    dispatchSpy.mockClear();
    fireEvent.click(screen.getByLabelText("Go to notebook cell 3"));

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
        detail: { cellIndex: 3 },
      })
    );
    dispatchSpy.mockRestore();
  });

  it("shows the model-facing output inspection image and opens it full screen", () => {
    render(
      <ToolInvocationCard
        toolName="inspect_output"
        args={{ cellIndex: 2, outputIndex: 1 }}
        result={{
          text: "[Rendered output inspection: cell 2, output 1]",
          visuals: [{
            visualId: "output-2-1",
            mimeType: "image/png",
            data: "cG5n",
            source: "inspect_output",
            cellIndex: 2,
            outputIndex: 1,
            byteLength: 3,
          }],
        }}
        state="output-available"
      />
    );

    const preview = screen.getByAltText("Rendered output preview");
    expect(preview).toHaveAttribute("src", "data:image/png;base64,cG5n");

    fireEvent.click(screen.getByRole("button", { name: "Open rendered output preview in full screen" }));

    expect(screen.getByAltText("Rendered output preview in full screen")).toHaveAttribute(
      "data-visual-id",
      "output-2-1"
    );
  });
});
