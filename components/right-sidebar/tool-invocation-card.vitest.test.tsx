import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ToolInvocationCard } from "./tool-invocation-card";

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
});
