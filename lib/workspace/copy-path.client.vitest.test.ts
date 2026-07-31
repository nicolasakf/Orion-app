import { describe, expect, it } from "vitest";

import { resolveWorkspaceCopyPath } from "./copy-path.client";

describe("resolveWorkspaceCopyPath", () => {
  it("builds an absolute path from a known Jupyter root", () => {
    expect(
      resolveWorkspaceCopyPath("projects/forecast/analysis.ipynb", "/Users/taylor/"),
    ).toEqual({
      path: "/Users/taylor/projects/forecast/analysis.ipynb",
      isAbsolute: true,
    });
  });

  it("uses the root itself when copying the Jupyter root workspace", () => {
    expect(resolveWorkspaceCopyPath("", "/Users/taylor")).toEqual({
      path: "/Users/taylor",
      isAbsolute: true,
    });
  });

  it("does not duplicate the separator when the Jupyter root is the POSIX root", () => {
    expect(resolveWorkspaceCopyPath("projects/forecast.ipynb", "/")).toEqual({
      path: "/projects/forecast.ipynb",
      isAbsolute: true,
    });
  });

  it("retains the Jupyter-relative path when the server root is unknown", () => {
    expect(resolveWorkspaceCopyPath("projects/forecast/analysis.ipynb", null)).toEqual({
      path: "projects/forecast/analysis.ipynb",
      isAbsolute: false,
    });
  });
});
