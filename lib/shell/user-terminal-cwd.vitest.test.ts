import { describe, expect, it } from "vitest";

import { resolveUserTerminalCwd } from "@/lib/shell/user-terminal-cwd";

describe("resolveUserTerminalCwd", () => {
  it("prefers an absolute workspace path when the Jupyter root is known", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: "Github_nicolasakf/Orion-app",
        rootDirectory: "/Users/taylor",
      })
    ).toBe("/Users/taylor/Github_nicolasakf/Orion-app");
  });

  it("uses the Jupyter-relative workspace when the root is unknown", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: "Github_nicolasakf/Orion-app",
      })
    ).toBe("Github_nicolasakf/Orion-app");
  });

  it("uses the Jupyter root itself when that folder is the workspace", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: "",
        rootDirectory: "/Users/taylor",
      })
    ).toBe("/Users/taylor");
  });

  it("omits cwd for the home preference so Jupyter starts at its root", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "home",
        workspaceDirectory: "Github_nicolasakf/Orion-app",
        rootDirectory: "/Users/taylor",
      })
    ).toBeUndefined();
  });

  it("falls back to Jupyter root when no workspace is open", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: null,
        rootDirectory: "/Users/taylor",
      })
    ).toBeUndefined();
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: "   ",
      })
    ).toBeUndefined();
  });
});
