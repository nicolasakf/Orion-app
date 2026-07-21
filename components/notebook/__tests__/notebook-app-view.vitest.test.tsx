import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
const businessRichMarkdownEditorMock = vi.hoisted(() => vi.fn());

interface BusinessRichMarkdownEditorMockProps {
  cellIndex: number;
  source: string;
  onSave: (source: string) => Promise<void>;
  onCancel: () => void;
  onFinishEditing: () => void;
}

vi.mock("@/components/notebook/markdown-renderer", () => ({
  MarkdownRenderer: ({ source }: { source: string }) => (
    <div data-testid="markdown">{source}</div>
  ),
}));

vi.mock("@/components/notebook/business-rich-markdown-editor", () => ({
  BusinessRichMarkdownEditor: ({
    cellIndex,
    source,
    onSave,
    onCancel,
    onFinishEditing,
  }: BusinessRichMarkdownEditorMockProps) => {
    const [draft, setDraft] = React.useState(source);
    const [isSaving, setIsSaving] = React.useState(false);
    const [saveError, setSaveError] = React.useState<string | null>(null);

    /** Mirrors the wrapper's explicit-only save lifecycle for App View integration tests. */
    const handleSave = async () => {
      if (isSaving) return;

      setIsSaving(true);
      setSaveError(null);
      try {
        await onSave(draft);
        onFinishEditing();
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not save this content.",
        );
      } finally {
        setIsSaving(false);
      }
    };

    /** Provides the editor-owned save and cancel shortcuts to the parent integration tests. */
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isSaving) onCancel();
        return;
      }

      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        void handleSave();
      }
    };

    businessRichMarkdownEditorMock({
      cellIndex,
      source,
      onSave,
      onCancel,
      onFinishEditing,
    });

    return (
      <div data-testid={`rich-markdown-editor-${cellIndex}`}>
        <textarea
          aria-label={`Edit markdown cell ${cellIndex + 1}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
        />
        {saveError ? <p role="alert">{saveError}</p> : null}
        <button type="button" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          Save
        </button>
      </div>
    );
  },
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
  businessRichMarkdownEditorMock.mockClear();
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

  it("opens one complete contents card and navigates from a selected section", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const notebook: NotebookType = {
      cells: [
        {
          cell_type: CellType.MARKDOWN,
          source: ["# Overview"],
          metadata: { orion: { id: "overview" } },
        },
        {
          cell_type: CellType.MARKDOWN,
          source: ["## Revenue"],
          metadata: { orion: { id: "revenue" } },
        },
        {
          cell_type: CellType.MARKDOWN,
          source: ["# Forecast"],
          metadata: { orion: { id: "forecast" } },
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    };

    render(<NotebookAppView businessMode notebook={notebook} />);

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Browse table of contents" }),
      { pointerType: "mouse" },
    );

    const contents = await screen.findByRole("navigation", {
      name: "App View table of contents",
    });
    expect(contents).toHaveTextContent("Overview");
    expect(contents).toHaveTextContent("Revenue");
    expect(contents).toHaveTextContent("Forecast");

    fireEvent.click(
      screen.getByRole("button", { name: "Go to Forecast" }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
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

  it("only enables direct markdown editing while Business Edit mode is active", () => {
    const onSaveMarkdownCell = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <NotebookAppView
        businessMode
        notebook={makeNotebook()}
        onSaveMarkdownCell={onSaveMarkdownCell}
      />,
    );

    fireEvent.click(screen.getByTestId("markdown"));
    expect(
      screen.queryByRole("textbox", { name: "Edit markdown cell 1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("rich-markdown-editor-0"),
    ).not.toBeInTheDocument();

    rerender(
      <NotebookAppView
        businessMode
        businessEditMode
        notebook={makeNotebook()}
        onSaveMarkdownCell={onSaveMarkdownCell}
      />,
    );

    const markdown = screen.getByTestId("markdown");
    expect(markdown.parentElement).toHaveClass(
      "transition-opacity",
      "hover:opacity-50",
    );
    fireEvent.click(markdown);

    expect(screen.getByTestId("rich-markdown-editor-0")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Edit markdown cell 1" }),
    ).toBeInTheDocument();
    expect(businessRichMarkdownEditorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cellIndex: 0, source: "# Intro" }),
    );

    rerender(
      <NotebookAppView
        businessMode
        notebook={makeNotebook()}
        onSaveMarkdownCell={onSaveMarkdownCell}
      />,
    );

    expect(
      screen.queryByRole("textbox", { name: "Edit markdown cell 1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("rich-markdown-editor-0"),
    ).not.toBeInTheDocument();
  });

  it("saves a business markdown edit with the target cell index", async () => {
    const onSaveMarkdownCell = vi.fn().mockResolvedValue(undefined);

    render(
      <NotebookAppView
        businessMode
        businessEditMode
        notebook={makeNotebook()}
        onSaveMarkdownCell={onSaveMarkdownCell}
      />,
    );

    fireEvent.click(screen.getByTestId("markdown"));
    expect(businessRichMarkdownEditorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cellIndex: 0, source: "# Intro" }),
    );
    const editor = screen.getByRole("textbox", {
      name: "Edit markdown cell 1",
    });
    fireEvent.change(editor, { target: { value: "# Revised\n\nDetails" } });
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onSaveMarkdownCell).toHaveBeenCalledWith(0, "# Revised\n\nDetails");
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "Edit markdown cell 1" }),
      ).not.toBeInTheDocument();
    });
  });

  it("cancels a business markdown edit without saving", () => {
    const onSaveMarkdownCell = vi.fn().mockResolvedValue(undefined);

    render(
      <NotebookAppView
        businessMode
        businessEditMode
        notebook={makeNotebook()}
        onSaveMarkdownCell={onSaveMarkdownCell}
      />,
    );

    fireEvent.click(screen.getByTestId("markdown"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Discard me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSaveMarkdownCell).not.toHaveBeenCalled();
    expect(screen.getByTestId("markdown")).toHaveTextContent("# Intro");
  });

  it("cancels a business markdown edit with Escape", () => {
    const onSaveMarkdownCell = vi.fn().mockResolvedValue(undefined);

    render(
      <NotebookAppView
        businessMode
        businessEditMode
        notebook={makeNotebook()}
        onSaveMarkdownCell={onSaveMarkdownCell}
      />,
    );

    fireEvent.click(screen.getByTestId("markdown"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(onSaveMarkdownCell).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps a failed business markdown edit open with its draft", async () => {
    const onSaveMarkdownCell = vi
      .fn()
      .mockRejectedValue(new Error("Notebook could not be saved."));

    render(
      <NotebookAppView
        businessMode
        businessEditMode
        notebook={makeNotebook()}
        onSaveMarkdownCell={onSaveMarkdownCell}
      />,
    );

    fireEvent.click(screen.getByTestId("markdown"));
    const editor = screen.getByRole("textbox", {
      name: "Edit markdown cell 1",
    });
    fireEvent.change(editor, { target: { value: "# Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notebook could not be saved.",
    );
    expect(editor).toHaveValue("# Keep this draft");
  });

  it("mentions a business output on click while Edit mode is active", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const onOrionUiAction = vi.fn();

    render(
      <NotebookAppView
        businessMode
        businessEditMode
        notebook={makeNotebook()}
        notebookPath="/workspace/demo.ipynb"
        onOrionUiAction={onOrionUiAction}
      />,
    );

    const output = screen.getByTestId("output");
    expect(output.parentElement).toHaveClass(
      "transition-opacity",
      "hover:opacity-50",
    );
    fireEvent.click(output);

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
    expect(onOrionUiAction).not.toHaveBeenCalled();
  });

  it("preserves ordinary output interactions outside Business Edit mode", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    dispatchSpy.mockClear();
    const onOrionUiAction = vi.fn();

    render(
      <NotebookAppView
        businessMode
        notebook={makeNotebook()}
        notebookPath="/workspace/demo.ipynb"
        onOrionUiAction={onOrionUiAction}
      />,
    );

    fireEvent.click(screen.getByTestId("output"));

    expect(onOrionUiAction).toHaveBeenCalledWith({ type: "submit" });
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "orion:mention-notebook-output" }),
    );
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

  it("offers markdown cell mention from the App View context menu", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(
      <NotebookAppView
        notebook={makeNotebook()}
        notebookPath="/workspace/demo.ipynb"
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("markdown"));
    fireEvent.click(await screen.findByText("Mention cell in chat"));

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "orion:mention-notebook-cell",
        detail: {
          notebookPath: "/workspace/demo.ipynb",
          cellIndex: 0,
          preview: "# Intro",
        },
      }),
    );
  });

  it("leaves a rich markdown editor outside the App View context menu", async () => {
    render(
      <NotebookAppView
        businessMode
        businessEditMode
        notebook={makeNotebook()}
        notebookPath="/workspace/demo.ipynb"
        onSaveMarkdownCell={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByTestId("markdown"));
    fireEvent.contextMenu(screen.getByTestId("rich-markdown-editor-0"));

    expect(screen.queryByText("Mention in chat")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.contextMenu(screen.getByTestId("markdown"));

    expect(await screen.findByText("Mention in chat")).toBeInTheDocument();
  });

  it("restores the last App View removal on Cmd+Z", () => {
    const onRemoveAppViewReference = vi.fn();
    const onRestoreAppViewReference = vi.fn();

    render(
      <NotebookAppView
        notebook={makeNotebook()}
        undoRemovalEnabled
        onRemoveAppViewReference={onRemoveAppViewReference}
        onRestoreAppViewReference={onRestoreAppViewReference}
      />,
    );

    const outputProps = outputRendererMock.mock.calls[0]?.[0];
    outputProps.onToggleOutputAppView?.(1, 0);
    fireEvent.keyDown(window, { key: "z", metaKey: true });

    const reference = {
      kind: "output",
      cellIndex: 1,
      outputIndex: 0,
    };
    expect(onRemoveAppViewReference).toHaveBeenCalledWith(reference);
    expect(onRestoreAppViewReference).toHaveBeenCalledWith(reference);
  });
});
