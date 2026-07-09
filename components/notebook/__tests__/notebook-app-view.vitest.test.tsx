import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookAppView } from "@/components/notebook/notebook-app-view";
import {
  INSERT_CHAT_SKILL_EVENT,
} from "@/lib/chat/chat-composer-events";
import {
  CellExecutionStatus,
  CellType,
  OutputType,
  type NotebookType,
} from "@/lib/types";

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
    isInAppView?: boolean;
    onMentionOutput?: (cellIndex: number, outputIndex: number) => void;
    onToggleOutputAppView?: (cellIndex: number, outputIndex: number) => void;
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

  it("shows a skeleton for selected outputs whose cell is queued", () => {
    const notebook = makeNotebook();
    notebook.cells[1]!.metadata = {
      orion: {
        id: "result",
        app: { outputs: { "0": { enabled: true } } },
        cellState: {
          executionInfo: {
            status: CellExecutionStatus.QUEUED,
          },
        },
      },
    };

    render(<NotebookAppView notebook={notebook} />);

    expect(screen.getByLabelText("Cell output queued")).toBeInTheDocument();
    expect(screen.queryByTestId("output")).not.toBeInTheDocument();
    expect(outputRendererMock).not.toHaveBeenCalled();
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

    expect(screen.getByText("No cells in App View yet")).toBeInTheDocument();
  });

  it("shows the business empty-file state for an empty notebook", () => {
    render(
      <NotebookAppView
        businessMode
        notebook={{
          ...makeNotebook(),
          cells: [],
        }}
      />,
    );

    expect(screen.getByText("This file is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Use the chat to ask Orion to start working on it."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No cells in App View yet")).not.toBeInTheDocument();
  });

  it("shows all markdown cells and outputs in business mode when nothing is selected", () => {
    render(
      <NotebookAppView
        businessMode
        notebook={{
          ...makeNotebook(),
          cells: makeNotebook().cells.map((cell) => ({
            ...cell,
            metadata: { orion: { id: cell.metadata?.orion?.id } },
          })),
        }}
      />,
    );

    expect(screen.getByText("# Intro")).toBeInTheDocument();
    expect(screen.getByText("# Hidden")).toBeInTheDocument();
    expect(screen.getAllByTestId("output")).toHaveLength(2);
    expect(screen.getByText("output 1:0")).toBeInTheDocument();
    expect(screen.getByText("output 1:1")).toBeInTheDocument();
    expect(screen.queryByText("This file is empty")).not.toBeInTheDocument();
  });

  it("shows a business no-outputs state for content without renderable App View items", () => {
    render(
      <NotebookAppView
        businessMode
        notebook={{
          ...makeNotebook(),
          cells: [
            {
              cell_type: CellType.CODE,
              source: ["print('hello')"],
              metadata: { orion: { id: "code" } },
              execution_count: null,
              outputs: [],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("No outputs yet")).toBeInTheDocument();
    expect(
      screen.getByText("Use the chat to run or build something for this file."),
    ).toBeInTheDocument();
  });

  it("offers the create-app skill shortcut in the empty state", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

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

    fireEvent.click(
      screen.getByRole("button", { name: "Use Create App skill" }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: INSERT_CHAT_SKILL_EVENT,
        detail: { skillName: "create-app" },
      }),
    );
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

    expect(screen.getByText("No cells in App View yet")).toBeInTheDocument();
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

  it("passes output mention and App View removal handlers to selected outputs", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const onRemoveAppViewReference = vi.fn();

    render(
      <NotebookAppView
        notebook={makeNotebook()}
        notebookPath="/workspace/demo.ipynb"
        onRemoveAppViewReference={onRemoveAppViewReference}
      />,
    );

    const outputProps = outputRendererMock.mock.calls[0]?.[0];
    expect(outputProps).toEqual(
      expect.objectContaining({
        cellIndex: 1,
        outputIndex: 0,
        isInAppView: true,
      }),
    );

    outputProps.onMentionOutput?.(1, 0);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "orion:mention-notebook-output",
        detail: expect.objectContaining({
          notebookPath: "/workspace/demo.ipynb",
          cellIndex: 1,
          outputIndex: 0,
        }),
      }),
    );

    outputProps.onToggleOutputAppView?.(1, 0);
    expect(onRemoveAppViewReference).toHaveBeenCalledWith({
      kind: "output",
      cellIndex: 1,
      outputIndex: 0,
    });
  });
});
