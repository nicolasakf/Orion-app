import { describe, expect, it } from "vitest";

import {
  ASK_MODE_TOOLS,
  EDIT_MODE_TOOLS,
  NO_DEPENDENCY_TOOLS,
  orionTools,
} from "./tool-schemas";

describe("web access tool schemas", () => {
  it("exposes web_fetch and web_search in all interaction modes", () => {
    expect(orionTools.web_fetch).toBeDefined();
    expect(orionTools.web_search).toBeDefined();
    expect(ASK_MODE_TOOLS.web_fetch).toBe(orionTools.web_fetch);
    expect(ASK_MODE_TOOLS.web_search).toBe(orionTools.web_search);
    expect(EDIT_MODE_TOOLS.web_fetch).toBe(orionTools.web_fetch);
    expect(EDIT_MODE_TOOLS.web_search).toBe(orionTools.web_search);
  });

  it("does not require Jupyter or kernel readiness", () => {
    expect(NO_DEPENDENCY_TOOLS.has("web_fetch")).toBe(true);
    expect(NO_DEPENDENCY_TOOLS.has("web_search")).toBe(true);
  });
});

describe("agent loop control schemas", () => {
  it("exposes deep EDA and visual inspection controls without kernel dependencies", () => {
    for (const toolName of [
      "begin_deep_eda",
      "record_visual_inspection",
      "update_deep_eda_state",
      "complete_deep_eda",
    ] as const) {
      expect(orionTools[toolName]).toBeDefined();
      expect(NO_DEPENDENCY_TOOLS.has(toolName)).toBe(true);
    }
  });

  it("keeps loop controls out of Ask and Edit modes", () => {
    expect("begin_deep_eda" in ASK_MODE_TOOLS).toBe(false);
    expect("begin_deep_eda" in EDIT_MODE_TOOLS).toBe(false);
  });
});
