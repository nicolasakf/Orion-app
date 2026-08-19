import { describe, expect, it } from "vitest";

import { resolveUserTerminalCwd } from "@/lib/shell/user-terminal-cwd";

describe("resolveUserTerminalCwd", () => {
  it("uses the current workspace when that preference is selected", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: "Github_nicolasakf/Orion-app",
      })
    ).toBe("Github_nicolasakf/Orion-app");
  });

  it("omits cwd for the home preference so Jupyter starts at its root", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "home",
        workspaceDirectory: "Github_nicolasakf/Orion-app",
      })
    ).toBeUndefined();
  });

  it("falls back to Jupyter root when no workspace is open", () => {
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: null,
      })
    ).toBeUndefined();
    expect(
      resolveUserTerminalCwd({
        preference: "workspace",
        workspaceDirectory: "",
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
