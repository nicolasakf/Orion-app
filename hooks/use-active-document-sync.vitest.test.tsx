import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Contents, ContentsManager } from "@jupyterlab/services";

import {
  ACTIVE_DOCUMENT_POLL_INTERVAL_MS,
  activeDocumentVersion,
  useActiveDocumentSync,
} from "@/hooks/use-active-document-sync";

interface FakeContentsManager {
  manager: ContentsManager;
  emit: (args: Contents.IChangedArgs) => void;
  get: ReturnType<typeof vi.fn>;
}

/** Creates the focused ContentsManager signal/get surface used by the sync hook. */
function createContentsManager(initialModel: Partial<Contents.IModel>): FakeContentsManager {
  let handler:
    | ((sender: ContentsManager, args: Contents.IChangedArgs) => void)
    | null = null;
  let currentModel = initialModel;
  const get = vi.fn(async () => currentModel);
  const manager = {
    get,
    fileChanged: {
      connect: vi.fn((nextHandler) => {
        handler = nextHandler;
      }),
      disconnect: vi.fn((nextHandler) => {
        if (handler === nextHandler) handler = null;
      }),
    },
  } as unknown as ContentsManager;

  return {
    manager,
    get,
    emit: (args) => handler?.(manager, args),
  };
}

/** Builds a complete-enough metadata model for version comparisons. */
function model(path: string, modified: string, hash?: string): Partial<Contents.IModel> {
  return {
    path,
    type: "file",
    last_modified: modified,
    size: 12,
    ...(hash ? { hash, hash_algorithm: "sha256" } : {}),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("activeDocumentVersion", () => {
  it("prefers a content hash and falls back to modification metadata", () => {
    expect(activeDocumentVersion(model("a.py", "one", "abc")).fingerprint).toBe(
      "hash:sha256:abc",
    );
    expect(activeDocumentVersion(model("a.py", "two")).fingerprint).toBe(
      "metadata:two:12",
    );
  });
});

describe("useActiveDocumentSync", () => {
  it("refreshes only for matching ContentsManager save events", async () => {
    const first = model("active.py", "one");
    const contents = createContentsManager(first);
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload,
      }),
    );

    act(() => result.current.recordLoadedModel(first));
    act(() => {
      contents.emit({
        type: "save",
        oldValue: null,
        newValue: model("background.py", "two"),
      });
      vi.advanceTimersByTime(100);
    });
    expect(onReload).not.toHaveBeenCalled();

    await act(async () => {
      contents.emit({
        type: "save",
        oldValue: null,
        newValue: model("active.py", "two"),
      });
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("current");
  });

  it("does not reload for the editor's own save", async () => {
    const first = model("active.py", "one");
    const second = model("active.py", "two");
    const contents = createContentsManager(first);
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      await result.current.runLocalWrite(async () => {
        contents.emit({ type: "save", oldValue: null, newValue: second });
        return second;
      });
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onReload).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("current");
  });

  it("preserves a dirty buffer and records a persistent conflict", async () => {
    const first = model("active.py", "one");
    const contents = createContentsManager(first);
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => true,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      contents.emit({
        type: "save",
        oldValue: null,
        newValue: model("active.py", "two"),
      });
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onReload).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("conflicted");
  });

  it("detects an out-of-process change on the five-second poll", async () => {
    const first = model("active.py", "one");
    const second = model("active.py", "two");
    const contents = createContentsManager(first);
    let polledModel = first;
    contents.get.mockImplementation(async () => polledModel);
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));
    polledModel = second;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_DOCUMENT_POLL_INTERVAL_MS);
    });

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("pauses polling while hidden and checks immediately when visible again", async () => {
    const first = model("active.py", "one");
    const second = model("active.py", "two");
    const contents = createContentsManager(first);
    contents.get.mockResolvedValue(second);
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_DOCUMENT_POLL_INTERVAL_MS);
    });
    expect(contents.get).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid matching save notifications into one refresh", async () => {
    const first = model("active.py", "one");
    const contents = createContentsManager(first);
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      contents.emit({
        type: "save",
        oldValue: null,
        newValue: model("active.py", "two"),
      });
      contents.emit({
        type: "save",
        oldValue: null,
        newValue: model("active.py", "three"),
      });
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when polling adds a hash to unchanged metadata", async () => {
    const first = model("active.py", "one");
    const hashed = model("active.py", "one", "same-content");
    const contents = createContentsManager(first);
    contents.get.mockResolvedValue(hashed);
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_DOCUMENT_POLL_INTERVAL_MS);
    });

    expect(onReload).not.toHaveBeenCalled();
  });

  it("falls back to legacy metadata polling when hash requests are unsupported", async () => {
    const first = model("active.py", "one");
    const second = model("active.py", "two");
    const contents = createContentsManager(first);
    contents.get
      .mockRejectedValueOnce(new Error("hash option is unsupported"))
      .mockResolvedValue(second);
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_DOCUMENT_POLL_INTERVAL_MS);
    });

    expect(contents.get).toHaveBeenCalledTimes(2);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("retargets a clean document after a same-manager rename", () => {
    const first = model("active.py", "one");
    const contents = createContentsManager(first);
    const onRenamed = vi.fn();
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload: vi.fn().mockResolvedValue(undefined),
        onRenamed,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    act(() => {
      contents.emit({
        type: "rename",
        oldValue: first,
        newValue: model("renamed.py", "two"),
      });
    });

    expect(onRenamed).toHaveBeenCalledWith("renamed.py");
  });

  it("distinguishes a known ContentsManager delete from a missing poll", () => {
    const first = model("active.py", "one");
    const contents = createContentsManager(first);
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload: vi.fn().mockResolvedValue(undefined),
        onDeleted,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    act(() => {
      contents.emit({ type: "delete", oldValue: first, newValue: null });
    });

    expect(onDeleted).toHaveBeenCalledWith("contents-manager");
  });

  it("reports a path missing during polling as an unexpected deletion", async () => {
    const first = model("active.py", "one");
    const contents = createContentsManager(first);
    const notFound = Object.assign(new Error("missing"), {
      response: { status: 404 },
    });
    contents.get.mockRejectedValue(notFound);
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => false,
        onReload: vi.fn().mockResolvedValue(undefined),
        onDeleted,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_DOCUMENT_POLL_INTERVAL_MS);
    });

    expect(onDeleted).toHaveBeenCalledWith("poll");
  });

  it("retargets a dirty rename without replacing the editor buffer", async () => {
    const first = model("active.py", "one");
    const contents = createContentsManager(first);
    const onRenamed = vi.fn();
    const onDeleted = vi.fn();
    const onReload = vi.fn().mockResolvedValue(undefined);
    let path = "active.py";
    const { result, rerender } = renderHook(() =>
      useActiveDocumentSync({
        path,
        contentsManager: contents.manager,
        isDirty: () => true,
        onReload,
        onRenamed,
        onDeleted,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    act(() => {
      contents.emit({
        type: "rename",
        oldValue: first,
        newValue: model("renamed.py", "two"),
      });
    });
    expect(result.current.state.status).toBe("renamed");
    expect(onRenamed).toHaveBeenCalledWith("renamed.py");

    path = "renamed.py";
    rerender();
    expect(result.current.state.status).toBe("renamed");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_DOCUMENT_POLL_INTERVAL_MS);
    });
    expect(onDeleted).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.reloadDiskVersion();
    });
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledTimes(1);
  });

  it("turns an edit made during an automatic reload into a conflict", async () => {
    const first = model("active.py", "one");
    const second = model("active.py", "two");
    const contents = createContentsManager(first);
    let dirty = false;
    const onReload = vi.fn(async () => {
      dirty = true;
      throw new Error("editor changed during reload");
    });
    const { result } = renderHook(() =>
      useActiveDocumentSync({
        path: "active.py",
        contentsManager: contents.manager,
        isDirty: () => dirty,
        onReload,
      }),
    );
    act(() => result.current.recordLoadedModel(first));

    await act(async () => {
      contents.emit({ type: "save", oldValue: null, newValue: second });
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.state.status).toBe("conflicted");
  });
});
