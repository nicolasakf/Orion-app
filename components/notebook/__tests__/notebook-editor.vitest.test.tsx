import {
  act,
  cleanup,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookEditor } from "@/components/notebook/notebook-editor";
import type {
  OrionUiLocalValue,
  OrionUiStateChangeContext,
} from "@/components/notebook/orion-ui-primitives";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { dispatchAgentNotebookExecutionEvent } from "@/lib/notebook/agent-notebook-events";
import {
  CellType,
  OutputType,
  type NotebookType,
} from "@/lib/types";

type NotebookAppViewTestProps = {
  notebook?: NotebookType;
  businessEditMode?: boolean;
  onSaveMarkdownCell?: (cellIndex: number, source: string) => Promise<void>;
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

vi.mock("@/components/notebook/notebook-cell", () => ({
  NotebookCell: () => null,
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

describe("NotebookEditor agent execution state", () => {
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
