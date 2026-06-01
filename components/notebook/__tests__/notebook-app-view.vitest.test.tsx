import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookAppView } from "@/components/notebook/notebook-app-view";
import { CellType, OutputType, type NotebookType } from "@/lib/types";

const outputRendererMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/notebook/markdown-renderer", () => ({
  MarkdownRenderer: ({ source }: { source: string }) => (
    <div data-testid="markdown">{source}</div>
  ),
}));

vi.mock("@/components/notebook/output-renderer", () => ({
  OutputRenderer: (props: {
    cellIndex: number;
    outputIndex: number;
    onOrionUiStateChange?: (
      key: string,
      value: string | number | boolean,
      outputId?: string,
    ) => void;
    onOrionUiAction?: (action: unknown) => void;
  }) => {
    outputRendererMock(props);
    return (
      <button
        type="button"
        data-testid="output"
        onClick={() => {
          props.onOrionUiStateChange?.("region", "west", "ui-output");
          props.onOrionUiAction?.({ type: "submit" });
        }}
      >
        output {props.cellIndex}:{props.outputIndex}
      </button>
    );
  },
}));

afterEach(() => {
  cleanup();
  outputRendererMock.mockClear();
});

function makeNotebook(metadata: NotebookType["metadata"] = {}): NotebookType {
  return {
    cells: [
      {
        cell_type: CellType.MARKDOWN,
        source: ["# Intro"],
        metadata: { orion: { id: "intro", app: { enabled: true } } },
      },
      {
        cell_type: CellType.CODE,
        source: ["1 + 1"],
        metadata: {
          orion: {
            id: "result",
            app: { outputs: { "0": { enabled: true } } },
          },
        },
        execution_count: 1,
        outputs: [
          {
            output_type: OutputType.DISPLAY_DATA,
            data: { "text/plain": ["2"] },
            metadata: {},
          },
          {
            output_type: OutputType.DISPLAY_DATA,
            data: { "text/plain": ["unselected"] },
            metadata: {},
          },
        ],
      },
      {
        cell_type: CellType.MARKDOWN,
        source: ["# Hidden"],
        metadata: { orion: { id: "hidden" } },
      },
    ],
    metadata,
    nbformat: 4,
    nbformat_minor: 5,
  };
}

describe("NotebookAppView", () => {
  it("renders selected markdown and outputs in notebook order", () => {
    render(<NotebookAppView notebook={makeNotebook()} />);

    expect(screen.getByTestId("markdown")).toHaveTextContent("# Intro");
    expect(screen.getByTestId("output")).toHaveTextContent("output 1:0");
    expect(screen.queryByText("# Hidden")).not.toBeInTheDocument();
    expect(outputRendererMock).toHaveBeenCalledWith(
      expect.objectContaining({ cellIndex: 1, outputIndex: 0 }),
    );
  });

  it("shows the empty state when no cells or outputs are selected", () => {
    render(
      <NotebookAppView
        notebook={{
          ...makeNotebook(),
          cells: makeNotebook().cells.map((cell) => ({
            ...cell,
            metadata: { orion: { id: cell.metadata?.orion?.id } },
          })),
        }}
      />,
    );

    expect(screen.getByText("No cells in App View")).toBeInTheDocument();
  });

  it("ignores notebook-level appView schema metadata", () => {
    render(
      <NotebookAppView
        notebook={{
          ...makeNotebook({
            orion: {
              appView: {
                schema: {
                  version: 1,
                  primitiveRegistry: { source: "builtin" },
                  root: {
                    type: "Page",
                    props: {},
                    children: [
                      { type: "MarkdownCell", props: { cellId: "intro" } },
                    ],
                  },
                },
              },
            },
          }),
          cells: [
            {
              cell_type: CellType.MARKDOWN,
              source: ["# Intro"],
              metadata: { orion: { id: "intro" } },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("No cells in App View")).toBeInTheDocument();
    expect(screen.queryByText("# Intro")).not.toBeInTheDocument();
  });

  it("passes Orion UI callbacks through selected outputs", () => {
    const onOrionUiStateChange = vi.fn();
    const onOrionUiAction = vi.fn();
    render(
      <NotebookAppView
        notebook={makeNotebook()}
        onOrionUiStateChange={onOrionUiStateChange}
        onOrionUiAction={onOrionUiAction}
      />,
    );

    fireEvent.click(screen.getByTestId("output"));

    expect(onOrionUiStateChange).toHaveBeenCalledWith(
      "region",
      "west",
      "ui-output",
    );
    expect(onOrionUiAction).toHaveBeenCalledWith({ type: "submit" });
  });
});
