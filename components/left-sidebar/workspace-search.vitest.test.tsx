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
  return {
    getContentsManager: vi.fn(() => ({})),
    onSessionsChanged: vi.fn(() => () => undefined),
    onStatusChanged: vi.fn(() => () => undefined),
  } as unknown as KernelService;
}

beforeEach(() => {
  vi.useFakeTimers();
  workspaceSearchMocks.clear.mockReset();
  workspaceSearchMocks.clearPath.mockReset();
  workspaceSearchMocks.searchWorkspace.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WorkspaceSearch", () => {
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
});
