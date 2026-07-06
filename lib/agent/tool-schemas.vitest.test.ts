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

describe("page reload tool schema", () => {
  it("is available without Jupyter or kernel readiness", () => {
    expect(orionTools.reload_page).toBeDefined();
    expect(NO_DEPENDENCY_TOOLS.has("reload_page")).toBe(true);
  });
});

describe("research-oriented notebook tool schemas", () => {
  it("describes notebook work as coherent research steps without numeric cell limits", () => {
    expect((orionTools.insert_cell as { description?: string }).description).toContain(
      "one coherent research step"
    );
    expect((orionTools.overwrite_cell_source as { description?: string }).description).toContain(
      "focused fix"
    );
    expect((orionTools.execute_cell as { description?: string }).description).toContain(
      "current coherent research step"
    );
    expect((orionTools.insert_cell as { description?: string }).description).not.toContain("at most 3");
  });

  it("does not expose legacy investigation control tools", () => {
    expect("begin_investigation" in orionTools).toBe(false);
    expect("record_visual_inspection" in orionTools).toBe(false);
    expect("update_investigation_state" in orionTools).toBe(false);
    expect("complete_investigation" in orionTools).toBe(false);
  });
});
