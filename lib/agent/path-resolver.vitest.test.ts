import { describe, expect, it } from "vitest";

import {
  isAbsoluteAgentPath,
  resolveAgentPath,
  toAgentAbsolutePath,
} from "./path-resolver";

describe("agent path resolver", () => {
  const rootDirectory = "/Users/taylor";

  it("maps an absolute workspace file path to a Jupyter-relative path", () => {
    expect(
      resolveAgentPath("/Users/taylor/project/package.json", { rootDirectory })
    ).toEqual({
      ok: true,
      originalPath: "/Users/taylor/project/package.json",
      jupyterPath: "project/package.json",
      wasAbsolute: true,
    });
  });

  it("maps an absolute path outside the workspace but inside the Jupyter root", () => {
    expect(resolveAgentPath("/Users/taylor/notes/todo.md", { rootDirectory })).toEqual({
      ok: true,
      originalPath: "/Users/taylor/notes/todo.md",
      jupyterPath: "notes/todo.md",
      wasAbsolute: true,
    });
  });

  it("maps the exact Jupyter root to the empty Jupyter-relative path", () => {
    expect(resolveAgentPath("/Users/taylor", { rootDirectory })).toEqual({
      ok: true,
      originalPath: "/Users/taylor",
      jupyterPath: "",
      wasAbsolute: true,
    });
  });

  it("rejects absolute paths outside the Jupyter root", () => {
    const result = resolveAgentPath("/etc/hosts", { rootDirectory });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("outside the Jupyter root");
  });

  it("accepts legacy relative paths for backward compatibility", () => {
    expect(resolveAgentPath("./project/../project/package.json", { rootDirectory })).toEqual({
      ok: true,
      originalPath: "./project/../project/package.json",
      jupyterPath: "project/package.json",
      wasAbsolute: false,
    });
  });

  it("preserves unresolved parent escapes in legacy relative paths", () => {
    expect(resolveAgentPath("../package.json", { rootDirectory })).toEqual({
      ok: true,
      originalPath: "../package.json",
      jupyterPath: "../package.json",
      wasAbsolute: false,
    });
  });

  it("detects POSIX and Windows absolute paths", () => {
    expect(isAbsoluteAgentPath("/Users/taylor/file.txt")).toBe(true);
    expect(isAbsoluteAgentPath("C:\\Users\\Taylor\\file.txt")).toBe(true);
    expect(isAbsoluteAgentPath("project/file.txt")).toBe(false);
  });

  it("builds prompt-facing absolute paths from Jupyter-relative paths", () => {
    expect(toAgentAbsolutePath("project/notebook.ipynb", { rootDirectory })).toBe(
      "/Users/taylor/project/notebook.ipynb"
    );
  });
});
