import { describe, expect, it } from "vitest";
import { ORION_TOOL_NAMES, NO_DEPENDENCY_TOOLS, ASK_MODE_TOOLS } from "@/lib/agent/tool-schemas";
import { getDefaultInteractionModeConfig } from "@/lib/agent/interaction-modes";

describe("connections tool registration", () => {
  it("is a known Orion tool", () => {
    expect(ORION_TOOL_NAMES).toContain("connections");
  });
  it("needs no Jupyter server or kernel", () => {
    expect(NO_DEPENDENCY_TOOLS.has("connections")).toBe(true);
  });
  it("is offered in Agent, Edit and Ask modes", () => {
    expect(getDefaultInteractionModeConfig("Agent").toolNames).toContain("connections");
    expect(getDefaultInteractionModeConfig("Edit").toolNames).toContain("connections");
    expect(getDefaultInteractionModeConfig("Ask").toolNames).toContain("connections");
    expect(Object.keys(ASK_MODE_TOOLS)).toContain("connections");
  });
});
