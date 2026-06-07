import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERACTION_MODE_CONFIGS,
  getToolsForInteractionMode,
  normalizeInteractionModeConfigs,
  resolveInteractionModeConfig,
} from "./interaction-modes";
import { ASK_MODE_TOOLS, EDIT_MODE_TOOLS, ORION_TOOL_NAMES, orionTools } from "./tool-schemas";

describe("interaction mode defaults", () => {
  it("matches the historical built-in tool sets", () => {
    const [agent, ask, edit] = DEFAULT_INTERACTION_MODE_CONFIGS;

    expect(agent.toolNames).toEqual(ORION_TOOL_NAMES);
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
});

