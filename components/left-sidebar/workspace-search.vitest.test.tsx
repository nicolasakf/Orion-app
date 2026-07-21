import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KernelService } from "@/lib/kernel/kernel-service";
import type { WorkspaceSearchResult } from "@/lib/workspace/workspace-search-service";

const workspaceSearchMocks = vi.hoisted(() => {
  const searchWorkspace = vi.fn();
  const clear = vi.fn();
  const clearPath = vi.fn();
  const effectiveSettings = {
    agent: {
      filesystem: {
        ignoreDirs: [] as string[],
        binaryExtensions: [] as string[],
      },
    },
  };

  class WorkspaceSearchServiceMock {
    searchWorkspace = searchWorkspace;
    clear = clear;
    clearPath = clearPath;
  }

  return {
    WorkspaceSearchServiceMock,
    clear,
    clearPath,
    effectiveSettings,
    searchWorkspace,
  };
});

vi.mock("@/hooks/use-orion-settings", () => ({
  useOrionSettings: () => ({
    effectiveSettings: workspaceSearchMocks.effectiveSettings,
  }),
}));

vi.mock("@/lib/workspace/workspace-search-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace/workspace-search-service")>();
  return {
    ...actual,
    WorkspaceSearchService: workspaceSearchMocks.WorkspaceSearchServiceMock,
  };
});

import { WorkspaceSearch } from "./workspace-search";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** Creates an explicitly resolved promise so test search responses can arrive out of order. */
function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

/** Builds a successful search result with a single file-name match. */
function fileResult(path: string): WorkspaceSearchResult {
  return {
    fileMatches: [path],
    contentMatches: new Map(),
    contentMatchCount: 0,
    fileMatchesTruncated: false,
    contentMatchesTruncated: false,
    errors: [],
  };
}

/** Returns the minimum KernelService surface that WorkspaceSearch subscribes to. */
function createKernelService(): KernelService {
  const fileChanged = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    getContentsManager: vi.fn(() => ({ fileChanged })),
    onSessionsChanged: vi.fn(() => () => undefined),
    onStatusChanged: vi.fn(() => () => undefined),
  } as unknown as KernelService;
}

/** Creates a kernel service fixture that can emit a Jupyter Contents change signal. */
function createKernelServiceWithFileChangeSignal(): {
  kernelService: KernelService;
  emitFileChanged: () => void;
} {
  let listener: (() => void) | null = null;
  const fileChanged = {
    connect: vi.fn((nextListener: () => void) => {
      listener = nextListener;
    }),
    disconnect: vi.fn((nextListener: () => void) => {
      if (listener === nextListener) listener = null;
    }),
  };

  return {
    kernelService: {
      getContentsManager: vi.fn(() => ({ fileChanged })),
      onSessionsChanged: vi.fn(() => () => undefined),
      onStatusChanged: vi.fn(() => () => undefined),
    } as unknown as KernelService,
    emitFileChanged: () => listener?.(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  workspaceSearchMocks.clear.mockReset();
  workspaceSearchMocks.clearPath.mockReset();
  workspaceSearchMocks.searchWorkspace.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WorkspaceSearch", () => {
  it("supports highlighted keyboard traversal, Enter selection, and mouse synchronization", async () => {
    const onFileSelect = vi.fn();
    const onNavigateToLine = vi.fn();
    workspaceSearchMocks.searchWorkspace.mockResolvedValue({
      fileMatches: ["alpha.txt", "beta.txt"],
      contentMatches: new Map([
        ["notes.txt", [{ line: 4, content: "needle in content" }]],
      ]),
      contentMatchCount: 1,
      fileMatchesTruncated: false,
      contentMatchesTruncated: false,
      errors: [],
    } satisfies WorkspaceSearchResult);

    render(
      <WorkspaceSearch
        workspaceDirectory="project"
        kernelService={createKernelService()}
        keyboardNavigation
        onFileSelect={onFileSelect}
        onNavigateToLine={onNavigateToLine}
      />
    );

    const input = screen.getByPlaceholderText("Search files and content");
    input.focus();
    fireEvent.change(input, { target: { value: "needle" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const alphaButton = screen.getByRole("button", { name: "alpha.txt" });
    const betaButton = screen.getByRole("button", { name: "beta.txt" });
    expect(alphaButton).toHaveAttribute("aria-current", "true");
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(betaButton).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFileSelect).toHaveBeenCalledWith({
      name: "beta.txt",
      path: "project/beta.txt",
    });

    const contentMatchButton = screen.getByRole("button", {
      name: /4.*needle.*in content/,
    });
    fireEvent.mouseEnter(contentMatchButton);
    expect(contentMatchButton).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNavigateToLine).toHaveBeenCalledWith(
      { name: "notes.txt", path: "project/notes.txt" },
      4
    );
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("qualifies a workspace-relative result that starts with the workspace name", async () => {
    const onFileSelect = vi.fn();
    workspaceSearchMocks.searchWorkspace.mockResolvedValue(
      fileResult("project/report.txt")
    );

    render(
      <WorkspaceSearch
        workspaceDirectory="project"
        kernelService={createKernelService()}
        onFileSelect={onFileSelect}
      />
    );

    const input = screen.getByPlaceholderText("Search files and content");
    fireEvent.change(input, { target: { value: "report" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "project/report.txt" })
    );
    expect(onFileSelect).toHaveBeenCalledWith({
      name: "report.txt",
      path: "project/project/report.txt",
    });
  });

  it("keeps a newer query result when an earlier request finishes later", async () => {
    const first = createDeferred<WorkspaceSearchResult>();
    const second = createDeferred<WorkspaceSearchResult>();
    workspaceSearchMocks.searchWorkspace
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(
      <WorkspaceSearch
        workspaceDirectory="project"
        kernelService={createKernelService()}
      />
    );

    const input = screen.getByPlaceholderText("Search files and content");
    fireEvent.change(input, { target: { value: "first" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    fireEvent.change(input, { target: { value: "second" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(workspaceSearchMocks.searchWorkspace).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve(fileResult("second.txt"));
      await Promise.resolve();
    });
    expect(screen.getByText("second.txt")).toBeInTheDocument();

    await act(async () => {
      first.resolve(fileResult("first.txt"));
      await Promise.resolve();
    });
    expect(screen.getByText("second.txt")).toBeInTheDocument();
    expect(screen.queryByText("first.txt")).not.toBeInTheDocument();
  });

  it("invalidates cached results and reruns the active query after a Contents mutation", async () => {
    const { kernelService, emitFileChanged } = createKernelServiceWithFileChangeSignal();
    workspaceSearchMocks.searchWorkspace.mockResolvedValue(fileResult("needle.txt"));

    render(
      <WorkspaceSearch
        workspaceDirectory="project"
        kernelService={kernelService}
      />
    );

    const input = screen.getByPlaceholderText("Search files and content");
    fireEvent.change(input, { target: { value: "needle" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(workspaceSearchMocks.searchWorkspace).toHaveBeenCalledTimes(1);

    await act(async () => {
      emitFileChanged();
      await Promise.resolve();
    });

    expect(workspaceSearchMocks.clear).toHaveBeenCalledTimes(1);
    expect(workspaceSearchMocks.searchWorkspace).toHaveBeenCalledTimes(2);
  });
});
