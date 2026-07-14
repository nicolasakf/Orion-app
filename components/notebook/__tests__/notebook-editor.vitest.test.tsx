import {
  cleanup,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookEditor } from "@/components/notebook/notebook-editor";
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
