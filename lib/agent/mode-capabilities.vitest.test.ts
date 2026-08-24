import { describe, expect, it } from "vitest";

import {
  buildModeToolAccessSection,
  modeAllowsChainedCellExecution,
  resolveModeToolCapabilities,
} from "./mode-capabilities";
import { getDefaultInteractionModeConfig } from "./interaction-modes";

describe("resolveModeToolCapabilities", () => {
  it("derives capabilities from the resolved tool names, not the base mode", () => {
    const askDefaults = getDefaultInteractionModeConfig("Ask");
    const restricted = resolveModeToolCapabilities({
      baseMode: "Ask",
      toolNames: askDefaults.toolNames,
      bashPolicy: askDefaults.bashPolicy,
    });

    expect(restricted).toMatchObject({
      canConnectNotebook: false,
      canEditNotebookCells: false,
      canExecuteCode: false,
      canEditFiles: false,
      canRunShell: true,
      bashPolicy: "read_only",
    });

    // Same base mode, customized by the user in settings.
    const customized = resolveModeToolCapabilities({
      baseMode: "Ask",
      toolNames: [...askDefaults.toolNames, "edit_file", "execute_cell"],
      bashPolicy: "full",
    });

    expect(customized).toMatchObject({
      canEditFiles: true,
      canExecuteCode: true,
      bashPolicy: "full",
    });
  });

  it("falls back to the base mode defaults when no tool names are given", () => {
    expect(resolveModeToolCapabilities({ baseMode: "Agent" })).toMatchObject({
      canConnectNotebook: true,
      canExecuteCode: true,
      canEditFiles: true,
      bashPolicy: "full",
    });
    expect(resolveModeToolCapabilities({ baseMode: "Edit" })).toMatchObject({
      canExecuteCode: false,
      canEditFiles: true,
    });
  });
});

describe("buildModeToolAccessSection", () => {
  it("stays silent for an unrestricted mode", () => {
    const section = buildModeToolAccessSection(
      resolveModeToolCapabilities({ baseMode: "Agent" })
    );

    expect(section).toBe("");
  });

  it("lists only the restrictions actually in force", () => {
    const section = buildModeToolAccessSection(
      resolveModeToolCapabilities({ baseMode: "Edit" })
    );

    expect(section).toContain("## Tool Access");
    expect(section).toContain("**No code execution.**");
    expect(section).not.toContain("**No file writes.**");
    expect(section).not.toContain("**No notebook edits.**");
    expect(section).not.toContain("**Read-only shell.**");
  });

  it("explains the read-only shell policy when bash is restricted", () => {
    const section = buildModeToolAccessSection(
      resolveModeToolCapabilities({ baseMode: "Ask" })
    );

    expect(section).toContain("**Read-only shell.**");
    expect(section).toContain("blocked before they run");
    expect(section).not.toContain("**No shell.**");
  });

  it("reports a missing shell instead of a shell policy", () => {
    const section = buildModeToolAccessSection(
      resolveModeToolCapabilities({ baseMode: "Ask", toolNames: ["read_file"] })
    );

    expect(section).toContain("**No shell.**");
    expect(section).not.toContain("**Read-only shell.**");
  });
});

describe("modeAllowsChainedCellExecution", () => {
  it("blocks the chained run in a mode that withholds execute_cell", () => {
    // Edit mode ships insert_cell and overwrite_cell_source, so the mutation
    // tool being present says nothing about whether the kernel may be reached.
    const edit = getDefaultInteractionModeConfig("Edit");

    expect(edit.toolNames).toContain("overwrite_cell_source");
    expect(edit.toolNames).not.toContain("execute_cell");
    expect(modeAllowsChainedCellExecution(edit.toolNames)).toBe(false);
  });

  it("allows it in the modes that can run cells", () => {
    expect(
      modeAllowsChainedCellExecution(getDefaultInteractionModeConfig("Agent").toolNames)
    ).toBe(true);
    expect(
      modeAllowsChainedCellExecution(getDefaultInteractionModeConfig("Explore").toolNames)
    ).toBe(true);
  });
});
