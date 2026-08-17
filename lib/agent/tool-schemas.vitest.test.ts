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

describe("Ask mode tool schemas", () => {
  it("allows read-only kernel discovery and skill loading", () => {
    expect(ASK_MODE_TOOLS.list_kernels).toBe(orionTools.list_kernels);
    expect(ASK_MODE_TOOLS.load_skill).toBe(orionTools.load_skill);
  });
});

describe("durable memory tool schema", () => {
  it("is kernel-free, available to write-capable modes, and omitted from Ask mode", () => {
    expect(orionTools.update_memory).toBeDefined();
    expect(NO_DEPENDENCY_TOOLS.has("update_memory")).toBe(true);
    expect(EDIT_MODE_TOOLS.update_memory).toBe(orionTools.update_memory);
    expect("update_memory" in ASK_MODE_TOOLS).toBe(false);
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

describe("execution knob defaults", () => {
  /** Parses a tool's input schema without the `unknown` gymnastics at each call. */
  function parseInput(toolName: keyof typeof orionTools, input: unknown) {
    return (orionTools[toolName] as unknown as {
      inputSchema: { safeParse: (value: unknown) => { success: boolean; data?: Record<string, unknown> };
      };
    }).inputSchema.safeParse(input);
  }

  it("accepts the execute_cell call that failed in session 1786897277027", () => {
    // The model omitted progressInterval; the schema rejected the call, and the
    // rejection surfaced as an unreadable "API Error" it never recovered from.
    const result = parseInput("execute_cell", {
      cellIndices: [1, 3, 5, 7, 14],
      stream: false,
      timeoutSeconds: 120,
    });

    expect(result.success).toBe(true);
    expect(result.data?.progressInterval).toBe(1000);
  });

  it("fills every execution knob when only the essential argument is given", () => {
    const result = parseInput("execute_cell", { cellIndices: [0] });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      cellIndices: [0],
      timeoutSeconds: 120,
      stream: false,
      progressInterval: 1000,
    });
  });

  it("defaults insert_cell to inserting without executing", () => {
    const result = parseInput("insert_cell", {
      cells: [{ cellType: "code", cellSource: "1 + 1", orionMetadataJson: "" }],
      startIndex: -1,
    });

    expect(result.success).toBe(true);
    expect(result.data?.execute).toBe(false);
    expect(result.data?.timeoutSeconds).toBe(120);
  });

  it("defaults execute_code and delete_cell knobs", () => {
    expect(parseInput("execute_code", { code: "1 + 1" }).data?.timeoutSeconds).toBe(120);
    expect(parseInput("delete_cell", { cellIndices: [2] }).data?.includeSource).toBe(false);
  });

  it("still rejects arguments that carry real intent", () => {
    // Defaults are only for transport knobs — a missing target is still an error.
    expect(parseInput("execute_cell", { stream: false }).success).toBe(false);
    expect(parseInput("execute_code", { timeoutSeconds: 30 }).success).toBe(false);
    expect(parseInput("insert_cell", { startIndex: 0 }).success).toBe(false);
  });

  it("keeps knobs inside their documented ranges", () => {
    expect(parseInput("execute_cell", { cellIndices: [0], progressInterval: 10 }).success).toBe(false);
    expect(parseInput("execute_cell", { cellIndices: [0], timeoutSeconds: 9_000 }).success).toBe(false);
  });
});
