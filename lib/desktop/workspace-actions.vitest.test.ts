import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeManagedWorkspacePathAction,
  executeNativeWorkspacePathAction,
  jupyterBaseUrlsMatch,
  parseWorkspacePathActionRequest,
  resolveWorkspacePath,
  type NativeWorkspaceShell,
} from "./workspace-actions";

describe("desktop workspace path actions", () => {
  let workspaceRoot: string;
  let nestedDirectory: string;
  let workspaceFile: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "orion-workspace-actions-"));
    nestedDirectory = join(workspaceRoot, "nested");
    workspaceFile = join(nestedDirectory, "report.pdf");
    await mkdir(nestedDirectory);
    await writeFile(workspaceFile, "report");
  });

  afterEach(async () => {
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  /** Builds a no-op Electron shell double with explicit native-action spies. */
  function createNativeShell(): NativeWorkspaceShell & {
    openPath: ReturnType<typeof vi.fn>;
    showItemInFolder: ReturnType<typeof vi.fn>;
  } {
    const openPath = vi.fn<(path: string) => Promise<string>>().mockResolvedValue("");
    const showItemInFolder = vi.fn<(path: string) => void>();
    return { openPath, showItemInFolder } as NativeWorkspaceShell & {
      openPath: ReturnType<typeof vi.fn>;
      showItemInFolder: ReturnType<typeof vi.fn>;
    };
  }

  it("normalizes equivalent managed and renderer Jupyter URLs", () => {
    expect(
      jupyterBaseUrlsMatch(
        "http://localhost:8888/lab?token=renderer-token",
        "http://127.0.0.1:8888/lab/"
      )
    ).toBe(true);
    expect(
      jupyterBaseUrlsMatch("http://127.0.0.1:8888/", "http://127.0.0.1:9999/")
    ).toBe(false);
  });

  it("requires a typed IPC request shape", () => {
    expect(() => parseWorkspacePathActionRequest(null)).toThrow("Invalid workspace path request");
    expect(() => parseWorkspacePathActionRequest({ path: "report.pdf" })).toThrow(
      "Invalid workspace path request"
    );
    expect(
      parseWorkspacePathActionRequest({
        path: "nested/report.pdf",
        jupyterBaseUrl: "http://127.0.0.1:8888/",
      })
    ).toEqual({
      path: "nested/report.pdf",
      jupyterBaseUrl: "http://127.0.0.1:8888/",
    });
  });

  it("rejects app-only desktop sessions without a managed Jupyter runtime", async () => {
    await expect(
      executeManagedWorkspacePathAction(
        "reveal",
        { jupyter: null, jupyterRootDirectory: workspaceRoot },
        { path: "nested/report.pdf", jupyterBaseUrl: "http://127.0.0.1:8888/" },
        createNativeShell()
      )
    ).rejects.toThrow("local Jupyter runtime launched by Orion");
  });

  it("rejects a request for a Jupyter server other than the managed session", async () => {
    const nativeShell = createNativeShell();

    await expect(
      executeManagedWorkspacePathAction(
        "reveal",
        {
          jupyter: { baseUrl: "http://127.0.0.1:8888/" },
          jupyterRootDirectory: workspaceRoot,
        },
        { path: "nested/report.pdf", jupyterBaseUrl: "http://127.0.0.1:9999/" },
        nativeShell
      )
    ).rejects.toThrow("belongs to a different Jupyter server");
    expect(nativeShell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("reveals a file through Finder or Explorer", async () => {
    const nativeShell = createNativeShell();

    await executeNativeWorkspacePathAction(
      "reveal",
      workspaceRoot,
      "nested/report.pdf",
      nativeShell
    );

    expect(nativeShell.showItemInFolder).toHaveBeenCalledWith(await realpath(workspaceFile));
    expect(nativeShell.openPath).not.toHaveBeenCalled();
  });

  it("opens folders rather than selecting them as files", async () => {
    const nativeShell = createNativeShell();

    await executeNativeWorkspacePathAction("reveal", workspaceRoot, "nested", nativeShell);

    expect(nativeShell.openPath).toHaveBeenCalledWith(await realpath(nestedDirectory));
    expect(nativeShell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("opens an unsupported file with the operating system default app", async () => {
    const nativeShell = createNativeShell();

    await executeNativeWorkspacePathAction(
      "open",
      workspaceRoot,
      "nested/report.pdf",
      nativeShell
    );

    expect(nativeShell.openPath).toHaveBeenCalledWith(await realpath(workspaceFile));
  });

  it("surfaces native open failures", async () => {
    const nativeShell = createNativeShell();
    nativeShell.openPath.mockResolvedValueOnce("No application is registered for this file type.");

    await expect(
      executeNativeWorkspacePathAction("open", workspaceRoot, "nested/report.pdf", nativeShell)
    ).rejects.toThrow("No application is registered for this file type");
  });

  it("rejects absolute paths, traversal, and missing paths", async () => {
    await expect(resolveWorkspacePath(workspaceRoot, "/etc/passwd")).rejects.toThrow(
      "relative to the active Jupyter root"
    );
    await expect(resolveWorkspacePath(workspaceRoot, "C:outside.txt")).rejects.toThrow(
      "relative to the active Jupyter root"
    );
    await expect(resolveWorkspacePath(workspaceRoot, "nested/../report.pdf")).rejects.toThrow(
      "cannot leave the active Jupyter root"
    );
    await expect(resolveWorkspacePath(workspaceRoot, "missing.txt")).rejects.toThrow(
      "no longer exists"
    );
  });

  it("rejects symlinks that resolve outside the managed workspace", async () => {
    const outsideDirectory = await mkdtemp(join(tmpdir(), "orion-outside-workspace-"));
    const escapedLink = join(workspaceRoot, "outside-link");
    try {
      await writeFile(join(outsideDirectory, "secret.txt"), "secret");
      await symlink(
        outsideDirectory,
        escapedLink,
        process.platform === "win32" ? "junction" : "dir"
      );

      await expect(resolveWorkspacePath(workspaceRoot, "outside-link/secret.txt")).rejects.toThrow(
        "resolves outside the active Jupyter root"
      );
    } finally {
      await rm(outsideDirectory, { force: true, recursive: true });
    }
  });
});
