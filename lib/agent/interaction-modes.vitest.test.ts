import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERACTION_MODE_CONFIGS,
  getSelectorInteractionModes,
  getToolsForInteractionMode,
  normalizeInteractionModeConfigs,
  resolveInteractionModeConfig,
  resolveSelectorInteractionModeId,
} from "./interaction-modes";
import { ASK_MODE_TOOLS, EDIT_MODE_TOOLS, ORION_TOOL_NAMES, orionTools } from "./tool-schemas";

describe("interaction mode defaults", () => {
  it("puts Agent first and gives Research the same default tool surface", () => {
    const [agent, research, edit, ask] = DEFAULT_INTERACTION_MODE_CONFIGS;

    expect(agent.id).toBe("Agent");
    expect(agent.toolNames).toEqual(ORION_TOOL_NAMES);
    expect(research.id).toBe("Research");
    expect(research.toolNames).toEqual(ORION_TOOL_NAMES);
    expect(research.hiddenInSelector).toBe(true);
    expect(research.beta).toBe(true);
    expect(agent.hiddenInSelector).toBe(false);
    expect(ask.toolNames).toEqual(Object.keys(ASK_MODE_TOOLS));
    expect(edit.toolNames).toEqual(Object.keys(EDIT_MODE_TOOLS));
    expect(ask.bashPolicy).toBe("read_only");
  });

  it("drops unknown tools while preserving valid custom mode tools", () => {
    const modes = normalizeInteractionModeConfigs([
      {
        id: "research",
        label: "Research",
        description: "",
        baseMode: "Ask",
        toolNames: ["web_search", "not_a_tool", "web_fetch", "web_search"],
        customSystemPrompt: "",
        builtIn: false,
        bashPolicy: "read_only",
      },
    ]);

    const custom = modes.find((mode) => mode.id === "research");
    expect(custom?.toolNames).toEqual(["web_search", "web_fetch"]);
  });

  it("upgrades the unchanged legacy Ask tool set to the current defaults", () => {
    const modes = normalizeInteractionModeConfigs([
      {
        id: "Ask",
        toolNames: [
          "read_file",
          "read_notebook",
          "read_cell",
          "read_cell_output",
          "bash",
          "await_command",
          "web_fetch",
          "web_search",
        ],
      },
    ]);

    expect(modes.find((mode) => mode.id === "Ask")?.toolNames).toEqual(
      Object.keys(ASK_MODE_TOOLS)
    );
  });

  it("adds Plotly inspection and terminal recovery to persisted Ask tool order", () => {
    const customizedToolNames = [
      "read_notebook",
      "read_cell",
      "read_cell_output",
      "bash",
      "await_command",
      "read_file",
      "web_fetch",
      "web_search",
    ] as const;
    const modes = normalizeInteractionModeConfigs([
      {
        id: "Ask",
        toolNames: customizedToolNames,
      },
    ]);

    expect(modes.find((mode) => mode.id === "Ask")?.toolNames).toEqual([
      "read_notebook",
      "read_cell",
      "read_cell_output",
      "inspect_plotly_output",
      "bash",
      "await_command",
      "kill_command",
      "read_file",
      "web_fetch",
      "web_search",
    ]);
  });

  it("leaves a persisted tool set without await_command alone", () => {
    const modes = normalizeInteractionModeConfigs([
      {
        id: "Ask",
        toolNames: ["read_file", "web_search"],
      },
    ]);

    expect(modes.find((mode) => mode.id === "Ask")?.toolNames).not.toContain(
      "kill_command"
    );
  });

  it("preserves a customized Ask tool set", () => {
    const modes = normalizeInteractionModeConfigs([
      {
        id: "Ask",
        toolNames: ["read_file", "web_search"],
      },
    ]);

    expect(modes.find((mode) => mode.id === "Ask")?.toolNames).toEqual([
      "read_file",
      "web_search",
    ]);
  });

  it("resolves request config and builds a matching tool object", () => {
    const mode = resolveInteractionModeConfig({
      modeId: "files",
      requestConfig: {
        id: "files",
        label: "Files",
        description: "",
        baseMode: "Edit",
        toolNames: ["read_file", "edit_file"],
        customSystemPrompt: "",
        builtIn: false,
        bashPolicy: "full",
      },
    });

    const tools = getToolsForInteractionMode(mode);
    expect(Object.keys(tools)).toEqual(["read_file", "edit_file"]);
    expect(tools.read_file).toBe(orionTools.read_file);
  });

  it("defaults unresolved mode requests to Agent", () => {
    expect(resolveInteractionModeConfig({ modeId: "missing" }).id).toBe("Agent");
  });

  it("hides Research from the selector by default and allows opting in", () => {
    const defaults = normalizeInteractionModeConfigs([]);
    expect(getSelectorInteractionModes(defaults).map((mode) => mode.id)).toEqual([
      "Agent",
      "Edit",
      "Ask",
    ]);

    const visibleResearch = normalizeInteractionModeConfigs([
      { id: "Research", hiddenInSelector: false },
    ]);
    expect(
      getSelectorInteractionModes(visibleResearch).some((mode) => mode.id === "Research")
    ).toBe(true);
  });

  it("falls back to the first visible mode when the current mode is hidden", () => {
    const modes = normalizeInteractionModeConfigs([]);
    expect(resolveSelectorInteractionModeId("Research", modes)).toBe("Agent");
    expect(resolveSelectorInteractionModeId("Agent", modes)).toBe("Agent");
  });
});
