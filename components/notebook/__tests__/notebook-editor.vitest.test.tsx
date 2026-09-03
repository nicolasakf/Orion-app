import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";

import { NotebookEditor } from "@/components/notebook/notebook-editor";
import type {
  OrionUiLocalValue,
  OrionUiStateChangeContext,
} from "@/components/notebook/orion-ui-primitives";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { dispatchAgentNotebookExecutionEvent } from "@/lib/notebook/agent-notebook-events";
import { RUN_ALL_CELLS_EVENT_NAME } from "@/lib/notebook/notebook-execution-events";
import {
  ORION_VERSIONED_OUTPUT_MIME_TYPE,
  getVersionedOutputPayload,
} from "@/lib/notebook/versioned-output";
import {
  CellExecutionStatus,
  CellType,
  OutputType,
  type NotebookType,
} from "@/lib/types";

type NotebookAppViewTestProps = {
  notebook?: NotebookType;
  businessEditMode?: boolean;
  onGoToSourceCell?: (cellIndex: number) => void;
  onSaveMarkdownCell?: (cellIndex: number, source: string) => Promise<void>;
  onAddAllCellsToAppView?: () => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
    change?: OrionUiStateChangeContext,
  ) => void;
  onOrionUiUnmount?: (outputId?: string) => void;
};

const notebookAppViewMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/notebook/notebook-app-view", () => ({
  NotebookAppView: (props: NotebookAppViewTestProps) => {
    notebookAppViewMock(props);
    return <div data-testid="notebook-app-view" />;
  },
}));

/** Cell text Monaco holds locally, keyed by cell index, before it is flushed. */
const unflushedCellSources = vi.hoisted(() => new Map<number, string>());
/** Excerpt plan returned by the mocked cell handle, keyed by cell index. */
const unflushedRunExcerpts = vi.hoisted(
  () => new Map<number, { source: string; advanceCursor: boolean }>(),
);
/** How many times a cell advanced the caret after a line run. */
const cursorAdvanceCounts = vi.hoisted(() => new Map<number, number>());

vi.mock("@/components/notebook/notebook-cell", () => ({
  NotebookCell: ({
    cell,
    cellIndex,
    onRegisterRef,
    onCellAction,
  }: {
    cell: { source: string[] };
    cellIndex: number;
    onRegisterRef?: (
      cellIndex: number,
      ref: {
        getSource: () => string;
        getRunExcerpt: () => { source: string; advanceCursor: boolean } | null;
        advanceCursorToNextLine: () => void;
        focusSource: () => void;
      } | null,
    ) => void;
    onCellAction?: (action: string, cellIndex: number) => void;
  }) => {
    useEffect(() => {
      onRegisterRef?.(cellIndex, {
        getSource: () =>
          unflushedCellSources.get(cellIndex) ?? cell.source.join(""),
        getRunExcerpt: () => unflushedRunExcerpts.get(cellIndex) ?? null,
        advanceCursorToNextLine: () => {
          cursorAdvanceCounts.set(
            cellIndex,
            (cursorAdvanceCounts.get(cellIndex) ?? 0) + 1,
          );
        },
        focusSource: () => {},
      });
      return () => onRegisterRef?.(cellIndex, null);
    }, [cell, cellIndex, onRegisterRef]);
    return (
      <button
        type="button"
        data-testid={`run-selection-${cellIndex}`}
        onClick={() => onCellAction?.("run-selection", cellIndex)}
      />
    );
  },
}));

vi.mock("@/components/notebook/notebook-publish-dialog", () => ({
  NotebookPublishDialog: () => null,
}));

vi.mock("@/components/notebook/kernel-dialogs", () => ({
  KernelSelectionDialog: () => null,
  KernelConnectionDialog: () => null,
  RunningKernelDialog: () => null,
}));

vi.mock("@/hooks/use-orion-settings", () => ({
  useOrionSetting: () => true,
}));

/** Builds a minimal notebook fixture that preserves source and metadata assertions. */
function makeNotebook(): NotebookType {
  return {
    cells: [
      {
        cell_type: CellType.MARKDOWN,
        source: ["# Original"],
        metadata: { orion: { id: "markdown-cell", app: { enabled: true } } },
      },
      {
        cell_type: CellType.CODE,
        source: ["1 + 1"],
        metadata: { orion: { id: "code-cell" } },
        execution_count: 1,
        outputs: [
          {
            output_type: OutputType.EXECUTE_RESULT,
            execution_count: 1,
            data: { "text/plain": ["2"] },
            metadata: {},
          },
        ],
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
}

/** Adapts the focused contents-manager test double to the editor's kernel contract. */
function makeKernelService(contentsManager: {
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}): KernelService {
  return {
    getContentsManager: () => contentsManager,
    getAvailableKernels: vi.fn().mockResolvedValue([]),
  } as unknown as KernelService;
}

/** Returns the latest App View save callback after the editor finishes loading. */
async function getMarkdownSaveCallback(): Promise<
  NonNullable<NotebookAppViewTestProps["onSaveMarkdownCell"]>
> {
  await waitFor(() => {
    const props = notebookAppViewMock.mock.lastCall?.[0] as
      | NotebookAppViewTestProps
      | undefined;
    expect(props?.notebook?.cells[0]?.cell_type).toBe(CellType.MARKDOWN);
    expect(props?.onSaveMarkdownCell).toBeTypeOf("function");
  });

  const props = notebookAppViewMock.mock.lastCall?.[0] as NotebookAppViewTestProps;
  return props.onSaveMarkdownCell!;
}

/** Returns the latest Orion UI state callback after App View renders. */
async function getOrionUiStateChangeCallback(): Promise<
  NonNullable<NotebookAppViewTestProps["onOrionUiStateChange"]>
> {
  await waitFor(() => {
    const props = notebookAppViewMock.mock.lastCall?.[0] as
      | NotebookAppViewTestProps
      | undefined;
    expect(props?.onOrionUiStateChange).toBeTypeOf("function");
  });

  const props = notebookAppViewMock.mock.lastCall?.[0] as NotebookAppViewTestProps;
  return props.onOrionUiStateChange!;
}

/** Returns the output lifecycle callback used to invalidate pending actions. */
async function getOrionUiUnmountCallback(): Promise<
  NonNullable<NotebookAppViewTestProps["onOrionUiUnmount"]>
> {
  await waitFor(() => {
    const props = notebookAppViewMock.mock.lastCall?.[0] as
      | NotebookAppViewTestProps
      | undefined;
    expect(props?.onOrionUiUnmount).toBeTypeOf("function");
  });

  const props = notebookAppViewMock.mock.lastCall?.[0] as NotebookAppViewTestProps;
  return props.onOrionUiUnmount!;
}

afterEach(() => {
  cleanup();
  notebookAppViewMock.mockClear();
  unflushedCellSources.clear();
  unflushedRunExcerpts.clear();
  cursorAdvanceCounts.clear();
  vi.restoreAllMocks();
});

describe("NotebookEditor business markdown saves", () => {
  it("persists the edited markdown source immediately while preserving its metadata", async () => {
    const notebook = makeNotebook();
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: notebook }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        businessMode
        businessEditMode
        activeNotebookView="app"
        kernelService={makeKernelService(contentsManager)}
      />,
    );

    const saveMarkdown = await getMarkdownSaveCallback();
    const appViewProps = notebookAppViewMock.mock.lastCall?.[0] as NotebookAppViewTestProps;
    expect(appViewProps.businessEditMode).toBe(true);
    await saveMarkdown(0, "# Revised\nBody");

    expect(contentsManager.save).toHaveBeenCalledWith(
      "/workspace/report.ipynb",
      expect.objectContaining({ type: "notebook", format: "json" }),
    );
    const savedRequest = contentsManager.save.mock.calls[0]?.[1] as {
      content: NotebookType;
    };
    expect(savedRequest.content.cells[0]).toEqual(
      expect.objectContaining({
        cell_type: CellType.MARKDOWN,
        source: ["# Revised\n", "Body"],
        metadata: { orion: { id: "markdown-cell", app: { enabled: true } } },
      }),
    );
    expect(savedRequest.content.cells[1]).toEqual(notebook.cells[1]);
  });

  it("rejects the App View save callback when notebook persistence fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockRejectedValue(new Error("Save failed")),
    };

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        businessMode
        activeNotebookView="app"
        kernelService={makeKernelService(contentsManager)}
      />,
    );

    const saveMarkdown = await getMarkdownSaveCallback();

    await expect(saveMarkdown(0, "# Revised")).rejects.toThrow("Save failed");
    expect(contentsManager.save).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe("NotebookEditor App View source navigation", () => {
  it("marks only the currently active notebook pane as active", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const kernelService = makeKernelService(contentsManager);
    const { container, rerender } = render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="notebook-app-view"]'),
      ).toBeInTheDocument();
    });
    const appPane = container.querySelector<HTMLElement>(
      '[data-orion-notebook-view="app"]',
    );
    const notebookPane = container.querySelector<HTMLElement>(
      '[data-orion-notebook-view="notebook"]',
    );
    expect(appPane).toHaveAttribute("data-orion-notebook-view-active", "true");
    expect(appPane).toHaveAttribute("aria-hidden", "false");
    expect(notebookPane).toHaveAttribute(
      "data-orion-notebook-view-active",
      "false",
    );
    expect(notebookPane).toHaveAttribute("aria-hidden", "true");

    rerender(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="notebook"
        kernelService={kernelService}
      />,
    );

    expect(appPane).toHaveAttribute("data-orion-notebook-view-active", "false");
    expect(appPane).toHaveAttribute("aria-hidden", "true");
    expect(notebookPane).toHaveAttribute(
      "data-orion-notebook-view-active",
      "true",
    );
    expect(notebookPane).toHaveAttribute("aria-hidden", "false");
  });

  it("switches Pro App View to Notebook View for the selected source cell", async () => {
    const onActiveNotebookViewChange = vi.fn();
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        onActiveNotebookViewChange={onActiveNotebookViewChange}
        kernelService={makeKernelService(contentsManager)}
      />,
    );

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.onGoToSourceCell).toBeTypeOf("function");
    });

    const props = notebookAppViewMock.mock.lastCall?.[0] as NotebookAppViewTestProps;
    act(() => props.onGoToSourceCell?.(1));

    expect(onActiveNotebookViewChange).toHaveBeenCalledWith("notebook");
  });

  it("does not expose source navigation in Business App View", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        businessMode
        activeNotebookView="app"
        kernelService={makeKernelService(contentsManager)}
      />,
    );

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.cells).toHaveLength(2);
      expect(props?.onGoToSourceCell).toBeUndefined();
    });
  });
});

describe("NotebookEditor App View bulk cell add", () => {
  it("adds every markdown cell and notebook output to App View metadata", async () => {
    const notebook = makeNotebook();
    notebook.cells[0]!.metadata = { orion: { id: "markdown-cell" } };
    notebook.cells[1]!.outputs = [
      ...(notebook.cells[1]!.outputs ?? []),
      {
        output_type: OutputType.DISPLAY_DATA,
        data: { "text/plain": ["second"] },
        metadata: {},
      },
    ];
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: notebook }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={makeKernelService(contentsManager)}
      />,
    );

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.onAddAllCellsToAppView).toBeTypeOf("function");
    });

    const props = notebookAppViewMock.mock.lastCall?.[0] as NotebookAppViewTestProps;
    act(() => props.onAddAllCellsToAppView?.());

    await waitFor(() => {
      const nextProps = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(nextProps?.notebook?.cells[0]?.metadata?.orion?.app?.enabled).toBe(
        true,
      );
      expect(nextProps?.notebook?.cells[1]?.metadata?.orion?.app?.outputs).toEqual({
        "0": { enabled: true },
        "1": { enabled: true },
      });
    });
  });
});

describe("NotebookEditor agent execution state", () => {
  it("saves Monaco text still inside the cell change debounce before an agent mutation", async () => {
    const path = "/workspace/report.ipynb";
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    let saveOpenNotebook:
      | ((path: string) => Promise<{ status: string }>)
      | null = null;

    render(
      <NotebookEditor
        filepath={path}
        kernelService={makeKernelService(contentsManager)}
        onNotebookSaveHandlerChange={(handler) => {
          saveOpenNotebook = handler;
        }}
      />,
    );
    await waitFor(() => {
      expect(saveOpenNotebook).toBeTypeOf("function");
      // The cell editors must be mounted, otherwise there is no Monaco text to read.
      expect(screen.getByTestId("run-selection-1")).toBeTruthy();
    });

    // The editor owns this value, but its debounced onChange has not run yet.
    unflushedCellSources.set(1, "const answer = 42;");

    const result = await saveOpenNotebook!(path);

    expect(result).toEqual({ status: "saved" });
    expect(contentsManager.save).toHaveBeenCalledTimes(1);
    const savedRequest = contentsManager.save.mock.calls[0]?.[1] as {
      content: NotebookType;
    };
    expect(savedRequest.content.cells[1]?.source).toEqual(["const answer = 42;"]);
  });

  it("refreshes a clean open notebook after a matching ContentsManager save", async () => {
    const path = "/workspace/report.ipynb";
    let currentNotebook = {
      ...makeNotebook(),
      metadata: { title: "Before agent edit" },
    };
    let fileChangedHandler:
      | ((sender: unknown, args: {
          type: "save";
          oldValue: null;
          newValue: { path: string; last_modified: string; size: number };
        }) => void)
      | null = null;
    const contentsManager = {
      get: vi.fn().mockImplementation(async () => ({ content: currentNotebook })),
      save: vi.fn().mockResolvedValue(undefined),
      fileChanged: {
        connect: vi.fn((handler) => {
          fileChangedHandler = handler;
        }),
        disconnect: vi.fn(),
      },
    };

    render(
      <NotebookEditor
        filepath={path}
        kernelService={makeKernelService(contentsManager)}
      />,
    );
    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("Before agent edit");
      expect(fileChangedHandler).toBeTypeOf("function");
    });

    currentNotebook = {
      ...makeNotebook(),
      metadata: { title: "After agent edit" },
    };
    act(() => {
      fileChangedHandler?.(contentsManager, {
        type: "save",
        oldValue: null,
        newValue: {
          path,
          last_modified: "2026-08-13T12:00:01.000Z",
          size: 100,
        },
      });
    });

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("After agent edit");
    });
  });

  it("merges an agent change into a notebook whose other cell is being typed in", async () => {
    const path = "/workspace/report.ipynb";
    let currentNotebook = {
      ...makeNotebook(),
      metadata: { title: "Before agent edit" },
    };
    let saveOpenNotebook:
      | ((path: string) => Promise<{ status: string }>)
      | null = null;
    let fileChangedHandler:
      | ((sender: unknown, args: {
          type: "save";
          oldValue: null;
          newValue: { path: string; last_modified: string; size: number };
        }) => void)
      | null = null;
    const contentsManager = {
      get: vi.fn().mockImplementation(async () => ({ content: currentNotebook })),
      save: vi.fn().mockResolvedValue(undefined),
      fileChanged: {
        connect: vi.fn((handler) => {
          fileChangedHandler = handler;
        }),
        disconnect: vi.fn(),
      },
    };

    const view = render(
      <NotebookEditor
        filepath={path}
        kernelService={makeKernelService(contentsManager)}
        onNotebookSaveHandlerChange={(handler) => {
          saveOpenNotebook = handler;
        }}
      />,
    );
    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("Before agent edit");
      expect(screen.getByTestId("run-selection-1")).toBeTruthy();
      expect(fileChangedHandler).toBeTypeOf("function");
    });

    // Monaco holds the new text, but the 300ms change debounce has not fired,
    // so nothing has marked the notebook dirty yet.
    unflushedCellSources.set(1, "1 + 2");

    // The agent leaves the cell being typed in untouched, so the two edits merge.
    currentNotebook = {
      ...makeNotebook(),
      metadata: { title: "After agent edit" },
    };
    act(() => {
      fileChangedHandler?.(contentsManager, {
        type: "save",
        oldValue: null,
        newValue: {
          path,
          last_modified: "2026-08-13T12:00:01.000Z",
          size: 100,
        },
      });
    });

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("After agent edit");
    });
    expect(view.queryByText(/changed on disk/i)).toBeNull();

    // The unsaved cell text survives the merge and is what a later save writes.
    const saved = await saveOpenNotebook!(path);
    expect(saved).toEqual({ status: "saved" });
    const savedRequest = contentsManager.save.mock.calls[0]?.[1] as {
      content: NotebookType;
    };
    expect(savedRequest.content.cells[1]?.source).toEqual(["1 + 2"]);
  });

  it("reports a conflict when the agent changes the same cell being typed in", async () => {
    const path = "/workspace/report.ipynb";
    let currentNotebook = {
      ...makeNotebook(),
      metadata: { title: "Before agent edit" },
    };
    let fileChangedHandler:
      | ((sender: unknown, args: {
          type: "save";
          oldValue: null;
          newValue: { path: string; last_modified: string; size: number };
        }) => void)
      | null = null;
    const contentsManager = {
      get: vi.fn().mockImplementation(async () => ({ content: currentNotebook })),
      save: vi.fn().mockResolvedValue(undefined),
      fileChanged: {
        connect: vi.fn((handler) => {
          fileChangedHandler = handler;
        }),
        disconnect: vi.fn(),
      },
    };

    const view = render(
      <NotebookEditor
        filepath={path}
        kernelService={makeKernelService(contentsManager)}
      />,
    );
    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("Before agent edit");
      expect(screen.getByTestId("run-selection-1")).toBeTruthy();
      expect(fileChangedHandler).toBeTypeOf("function");
    });

    unflushedCellSources.set(1, "1 + 2");

    // The agent rewrote the very cell that holds unflushed text.
    const diverged = makeNotebook();
    diverged.cells[1]!.source = ["1 + 3"];
    currentNotebook = { ...diverged, metadata: { title: "After agent edit" } };
    act(() => {
      fileChangedHandler?.(contentsManager, {
        type: "save",
        oldValue: null,
        newValue: {
          path,
          last_modified: "2026-08-13T12:00:01.000Z",
          size: 100,
        },
      });
    });

    expect(await view.findByText(/changed on disk/i)).toBeTruthy();
    const props = notebookAppViewMock.mock.lastCall?.[0] as
      | NotebookAppViewTestProps
      | undefined;
    expect(props?.notebook?.metadata.title).toBe("Before agent edit");
  });

  it("does not report a conflict when agent execution state precedes its disk save", async () => {
    const path = "/workspace/report.ipynb";
    let currentNotebook = {
      ...makeNotebook(),
      metadata: { title: "Before agent execution" },
    };
    let fileChangedHandler:
      | ((sender: unknown, args: {
          type: "save";
          oldValue: null;
          newValue: { path: string; last_modified: string; size: number };
        }) => void)
      | null = null;
    const contentsManager = {
      get: vi.fn().mockImplementation(async () => ({ content: currentNotebook })),
      save: vi.fn().mockResolvedValue(undefined),
      fileChanged: {
        connect: vi.fn((handler) => {
          fileChangedHandler = handler;
        }),
        disconnect: vi.fn(),
      },
    };
    const onUnsavedChangesChange = vi.fn();
    const view = render(
      <NotebookEditor
        filepath={path}
        kernelService={makeKernelService(contentsManager)}
        onUnsavedChangesChange={onUnsavedChangesChange}
      />,
    );
    await waitFor(() => {
      expect(fileChangedHandler).toBeTypeOf("function");
    });

    act(() => {
      const startTime = new Date("2026-08-14T12:00:00.000Z");
      dispatchAgentNotebookExecutionEvent({
        type: "queued",
        notebookPath: path,
        cellIndices: [1],
      });
      dispatchAgentNotebookExecutionEvent({
        type: "start",
        notebookPath: path,
        cellIndex: 1,
        startTime,
      });
      dispatchAgentNotebookExecutionEvent({
        type: "complete",
        notebookPath: path,
        cellIndex: 1,
        outputs: [],
        executionInfo: {
          status: CellExecutionStatus.SUCCESS,
          startTime,
          endTime: new Date("2026-08-14T12:00:01.000Z"),
          duration: 1_000,
        },
      });
    });
    expect(onUnsavedChangesChange).not.toHaveBeenCalledWith(true);

    currentNotebook = {
      ...makeNotebook(),
      metadata: { title: "After agent execution" },
    };
    act(() => {
      fileChangedHandler?.(contentsManager, {
        type: "save",
        oldValue: null,
        newValue: {
          path,
          last_modified: "2026-08-14T12:00:01.000Z",
          size: 100,
        },
      });
    });

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("After agent execution");
    });
    expect(view.queryByText("This file changed on disk")).toBeNull();
  });

  it("ignores a stale notebook load after the filepath changes", async () => {
    const firstPath = "/workspace/first.ipynb";
    const secondPath = "/workspace/second.ipynb";
    const firstNotebook = {
      ...makeNotebook(),
      metadata: { title: "First notebook" },
    };
    const secondNotebook = {
      ...makeNotebook(),
      metadata: { title: "Second notebook" },
    };
    let resolveFirstLoad: ((value: { content: NotebookType }) => void) | undefined;
    const firstLoad = new Promise<{ content: NotebookType }>((resolve) => {
      resolveFirstLoad = resolve;
    });
    const contentsManager = {
      get: vi.fn((path: string) =>
        path === firstPath
          ? firstLoad
          : Promise.resolve({ content: secondNotebook }),
      ),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const kernelService = makeKernelService(contentsManager);
    const { rerender } = render(
      <NotebookEditor filepath={firstPath} kernelService={kernelService} />,
    );

    await waitFor(() => {
      expect(contentsManager.get).toHaveBeenCalledWith(firstPath, { content: true });
    });
    rerender(
      <NotebookEditor filepath={secondPath} kernelService={kernelService} />,
    );
    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("Second notebook");
    });

    await act(async () => {
      resolveFirstLoad?.({ content: firstNotebook });
      await firstLoad;
    });

    const props = notebookAppViewMock.mock.lastCall?.[0] as
      | NotebookAppViewTestProps
      | undefined;
    expect(props?.notebook?.metadata.title).toBe("Second notebook");
  });

  it("resets prior-path execution state without clearing events queued for the new path", async () => {
    const firstPath = "/workspace/first.ipynb";
    const secondPath = "/workspace/second.ipynb";
    const secondNotebook = {
      ...makeNotebook(),
      metadata: { title: "Second notebook" },
    };
    let resolveSecondLoad: ((value: { content: NotebookType }) => void) | undefined;
    const contentsManager = {
      get: vi.fn((path: string) => {
        if (path === secondPath) {
          return new Promise<{ content: NotebookType }>((resolve) => {
            resolveSecondLoad = resolve;
          });
        }
        return Promise.resolve({ content: makeNotebook() });
      }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const onIsRunningChange = vi.fn();
    const { rerender } = render(
      <NotebookEditor
        filepath={firstPath}
        kernelService={makeKernelService(contentsManager)}
        onIsRunningChange={onIsRunningChange}
      />,
    );

    await waitFor(() => {
      expect(contentsManager.get).toHaveBeenCalledWith(firstPath, { content: true });
    });
    dispatchAgentNotebookExecutionEvent({
      type: "queued",
      notebookPath: firstPath,
      cellIndices: [0],
    });
    await waitFor(() => {
      expect(onIsRunningChange).toHaveBeenLastCalledWith(true);
    });

    rerender(
      <NotebookEditor
        filepath={secondPath}
        kernelService={makeKernelService(contentsManager)}
        onIsRunningChange={onIsRunningChange}
      />,
    );

    await waitFor(() => {
      expect(contentsManager.get).toHaveBeenCalledWith(secondPath, { content: true });
      expect(onIsRunningChange).toHaveBeenLastCalledWith(false);
    });

    dispatchAgentNotebookExecutionEvent({
      type: "queued",
      notebookPath: secondPath,
      cellIndices: [0],
    });
    await waitFor(() => {
      expect(onIsRunningChange).toHaveBeenLastCalledWith(true);
    });

    resolveSecondLoad?.({ content: secondNotebook });
    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.metadata.title).toBe("Second notebook");
      expect(onIsRunningChange).toHaveBeenLastCalledWith(true);
    });
  });
});

describe("NotebookEditor execution queue cancellation", () => {
  it("merges version history when a manually executed cell completes", async () => {
    const notebook = makeNotebook();
    notebook.cells[1]!.outputs = [
      {
        output_type: OutputType.EXECUTE_RESULT,
        execution_count: 1,
        data: {
          "text/plain": ["old value"],
          [ORION_VERSIONED_OUTPUT_MIME_TYPE]: {
            version: 1,
            maxVersions: 10,
            current: {
              id: "v1",
              createdAt: "2026-08-13T12:00:00.000Z",
              metadata: {},
            },
            history: [],
          },
        },
        metadata: {},
      },
    ];
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: notebook }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const execute = vi.fn(async (_source: string, onMessage: (msg: unknown) => void) => {
      onMessage({
        header: { msg_type: "execute_result" },
        content: {
          execution_count: 2,
          data: {
            "text/plain": "new value",
            [ORION_VERSIONED_OUTPUT_MIME_TYPE]: {
              version: 1,
              maxVersions: 10,
              current: {
                id: "v2",
                createdAt: "2026-08-14T12:00:00.000Z",
                metadata: {},
              },
              history: [],
            },
          },
          metadata: {},
        },
      });
      return { done: Promise.resolve() };
    });
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );
    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.cells[1]?.outputs).toHaveLength(1);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(RUN_ALL_CELLS_EVENT_NAME, {
          detail: { stopOnError: true },
        }),
      );
    });
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      const output = props?.notebook?.cells[1]?.outputs?.[0];
      expect(getVersionedOutputPayload(output!)?.history[0]?.id).toBe("v1");
    });
  });

  it("does not continue an ignore-errors batch after the queue is cleared", async () => {
    const notebook: NotebookType = {
      ...makeNotebook(),
      cells: [
        {
          cell_type: CellType.CODE,
          source: ["first"],
          metadata: { orion: { id: "first-code-cell" } },
          execution_count: null,
          outputs: [],
        },
        {
          cell_type: CellType.CODE,
          source: ["second"],
          metadata: { orion: { id: "second-code-cell" } },
          execution_count: null,
          outputs: [],
        },
      ],
    };
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: notebook }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    let resolveFirstExecution: (() => void) | undefined;
    const firstExecution = new Promise<void>((resolve) => {
      resolveFirstExecution = resolve;
    });
    let executionCount = 0;
    const execute = vi.fn(async () => {
      executionCount += 1;
      return {
        done: executionCount === 1 ? firstExecution : Promise.resolve(),
      };
    });
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;
    const onIsRunningChange = vi.fn();

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
        onIsRunningChange={onIsRunningChange}
      />,
    );

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.cells).toHaveLength(2);
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent(RUN_ALL_CELLS_EVENT_NAME, {
          detail: { stopOnError: false },
        }),
      );
    });
    await waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(1);
      expect(onIsRunningChange).toHaveBeenLastCalledWith(true);
    });

    act(() => {
      window.dispatchEvent(new Event("clearCellExecutionQueue"));
    });
    await act(async () => {
      resolveFirstExecution?.();
      await firstExecution;
    });

    await waitFor(() => {
      expect(onIsRunningChange).toHaveBeenLastCalledWith(false);
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("NotebookEditor selected-source execution", () => {
  it("runs only the selected excerpt without replacing the cell source", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    unflushedRunExcerpts.set(1, { source: "print(1)", advanceCursor: false });

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        kernelService={kernelService}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("run-selection-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("run-selection-1"));

    await waitFor(() => {
      expect(execute).toHaveBeenCalledWith("print(1)", expect.any(Function));
    });
    expect(execute).not.toHaveBeenCalledWith("1 + 1", expect.any(Function));
    expect(cursorAdvanceCounts.get(1) ?? 0).toBe(0);

    await waitFor(() => {
      const props = notebookAppViewMock.mock.lastCall?.[0] as
        | NotebookAppViewTestProps
        | undefined;
      expect(props?.notebook?.cells[1]?.source).toEqual(["1 + 1"]);
    });
  });

  it("runs the current line and advances the caret when nothing is selected", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    unflushedRunExcerpts.set(1, { source: "1 + 1", advanceCursor: true });

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        kernelService={kernelService}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("run-selection-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("run-selection-1"));

    await waitFor(() => {
      expect(execute).toHaveBeenCalledWith("1 + 1", expect.any(Function));
    });
    expect(cursorAdvanceCounts.get(1)).toBe(1);
  });

  it("advances the caret on an empty line without executing", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    unflushedRunExcerpts.set(1, { source: "", advanceCursor: true });

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        kernelService={kernelService}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("run-selection-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("run-selection-1"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(execute).not.toHaveBeenCalled();
    expect(cursorAdvanceCounts.get(1)).toBe(1);
  });
});

describe("NotebookEditor Orion UI change actions", () => {
  it("waits for a busy-kernel state sync before running target cells", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    let resolveStateReply:
      | ((reply: { content: { status: "ok" } }) => void)
      | undefined;
    const stateReply = new Promise<{ content: { status: "ok" } }>((resolve) => {
      resolveStateReply = resolve;
    });
    const requestExecute = vi.fn(() => ({ done: stateReply }));
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelConnection = {
      isDisposed: false,
      status: "busy",
      requestExecute,
    };
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "busy" }),
      getStatus: () => "busy",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    changeState("region", "east", "ui-output", {
      action: { type: "execute_cells", cellIds: ["code-cell"] },
      debounceMs: 0,
      execute: true,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(requestExecute).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();

    await act(async () => {
      resolveStateReply?.({ content: { status: "ok" } });
      await stateReply;
    });
    await waitFor(() => {
      expect(execute).toHaveBeenCalledWith("1 + 1", expect.any(Function));
    });
  });

  it("does not run target cells when Python state synchronization fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const requestExecute = vi.fn(() => ({
      done: Promise.resolve({
        content: { status: "error", evalue: "State update failed" },
      }),
    }));
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelConnection = {
      isDisposed: false,
      status: "idle",
      requestExecute,
    };
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    changeState("region", "east", "ui-output", {
      action: { type: "execute_cells", cellIds: ["code-cell"] },
      debounceMs: 0,
      execute: true,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(requestExecute).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "Failed to sync Orion UI state",
      "State update failed",
    );
  });

  it("coalesces rapid state changes targeting the same cells", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const requestExecute = vi.fn(() => ({
      done: Promise.resolve({ content: { status: "ok" } }),
    }));
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelConnection = {
      isDisposed: false,
      status: "idle",
      requestExecute,
    };
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    const change = {
      action: { type: "execute_cells", cellIds: ["code-cell"] },
      debounceMs: 20,
      execute: true,
    };
    changeState("query", "a", "ui-output", change);
    changeState("query", "ab", "ui-output", change);

    await waitFor(() => {
      expect(requestExecute).toHaveBeenCalledTimes(2);
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  it("deduplicates target ids and ignores missing or non-code cells", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const requestExecute = vi.fn(() => ({
      done: Promise.resolve({ content: { status: "ok" } }),
    }));
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelConnection = {
      isDisposed: false,
      status: "idle",
      requestExecute,
    };
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    changeState("region", "east", "ui-output", {
      action: {
        type: "execute_cells",
        cellIds: ["code-cell", "code-cell", "missing", "markdown-cell", 42],
      },
      debounceMs: 0,
      execute: true,
    });

    await waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith("1 + 1", expect.any(Function));
    });
  });

  it("invalidates a pending action when its Orion UI output unmounts", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const kernelConnection = {
      isDisposed: false,
      status: "idle",
      requestExecute: vi.fn(() => ({
        done: Promise.resolve({ content: { status: "ok" } }),
      })),
    };
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    const unmountOutput = await getOrionUiUnmountCallback();
    changeState("query", "revenue", "ui-output", {
      action: { type: "execute_cells", cellIds: ["code-cell"] },
      debounceMs: 25,
      execute: true,
    });
    unmountOutput("ui-output");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(kernelConnection.requestExecute).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("invalidates pending actions when execution is interrupted", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const kernelConnection = {
      isDisposed: false,
      status: "idle",
      requestExecute: vi.fn(() => ({
        done: Promise.resolve({ content: { status: "ok" } }),
      })),
    };
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    changeState("query", "revenue", "ui-output", {
      action: { type: "execute_cells", cellIds: ["code-cell"] },
      debounceMs: 25,
      execute: true,
    });
    window.dispatchEvent(new Event("clearCellExecutionQueue"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(kernelConnection.requestExecute).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("ignores delayed state replies after switching notebooks", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    let resolveStateReply:
      | ((reply: { content: { status: "ok" } }) => void)
      | undefined;
    const stateReply = new Promise<{ content: { status: "ok" } }>((resolve) => {
      resolveStateReply = resolve;
    });
    const kernelConnection = {
      isDisposed: false,
      status: "idle",
      requestExecute: vi.fn(() => ({ done: stateReply })),
    };
    const execute = vi.fn(async () => ({ done: Promise.resolve() }));
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;
    const { rerender } = render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    changeState("query", "revenue", "ui-output", {
      action: { type: "execute_cells", cellIds: ["code-cell"] },
      debounceMs: 0,
      execute: true,
    });
    rerender(
      <NotebookEditor
        filepath="/workspace/other.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    await act(async () => {
      resolveStateReply?.({ content: { status: "ok" } });
      await stateReply;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps only the latest pending rerun while an automatic run is active", async () => {
    const contentsManager = {
      get: vi.fn().mockResolvedValue({ content: makeNotebook() }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const kernelConnection = {
      isDisposed: false,
      status: "idle",
      requestExecute: vi.fn(() => ({
        done: Promise.resolve({ content: { status: "ok" } }),
      })),
    };
    let resolveActiveRun: (() => void) | undefined;
    const activeRun = new Promise<void>((resolve) => {
      resolveActiveRun = resolve;
    });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ done: activeRun })
      .mockResolvedValue({ done: Promise.resolve() });
    const kernelService = {
      getContentsManager: () => contentsManager,
      getAvailableKernels: vi.fn().mockResolvedValue([]),
      getKernelConnection: () => kernelConnection,
      getKernel: () => ({ name: "python", status: "idle" }),
      getStatus: () => "idle",
      execute,
    } as unknown as KernelService;

    render(
      <NotebookEditor
        filepath="/workspace/report.ipynb"
        activeNotebookView="app"
        kernelService={kernelService}
      />,
    );

    const changeState = await getOrionUiStateChangeCallback();
    const change = {
      action: { type: "execute_cells", cellIds: ["code-cell"] },
      debounceMs: 0,
      execute: true,
    };
    changeState("query", "a", "ui-output", change);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    changeState("query", "ab", "ui-output", change);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    changeState("query", "abc", "ui-output", change);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(execute).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveActiveRun?.();
      await activeRun;
    });
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  });
});
