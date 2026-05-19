import { describe, expect, test } from "vitest";

import type { NotebookCellType, NotebookType } from "@/lib/types";
import { CellType } from "@/lib/types";

import {
  getSubagentDisableModelInvocation,
  getSubagentModelId,
  stripAllowedLeadingHeading,
  validateSubagentNotebookStructure,
} from "./subagent-validation";

function markdown(source: string): NotebookCellType {
  return {
    cell_type: CellType.MARKDOWN,
    metadata: {},
    source: [source],
  };
}

function code(source: string): NotebookCellType {
  return {
    cell_type: CellType.CODE,
    metadata: {},
    source: [source],
    outputs: [],
    execution_count: null,
  };
}

function notebook(cells: NotebookCellType[], metadata: NotebookType["metadata"] = {}): NotebookType {
  return {
    cells,
    metadata,
    nbformat: 4,
    nbformat_minor: 5,
  };
}

describe("subagent validation", () => {
  test("accepts the required three markdown cells", () => {
    const result = validateSubagentNotebookStructure(
      notebook([
        markdown("# Data Profiler"),
        markdown("Description\n\nProfiles datasets."),
        markdown("## System Prompt\n\nYou inspect data."),
      ]),
    );

    expect(result.issues).toEqual([]);
    expect(result.cellIssues.size).toBe(0);
  });

  test("reports missing h1 and non-markdown prompt cells", () => {
    const result = validateSubagentNotebookStructure(
      notebook([markdown("No heading"), markdown("Useful description"), code("print(1)")]),
    );

    expect(result.cellIssues.get(0)).toContain("must start with an H1");
    expect(result.cellIssues.get(2)).toContain("must be a markdown system prompt");
  });

  test("strips allowed headings before checking body content", () => {
    expect(stripAllowedLeadingHeading("## Description\n\nBody", new Set(["description"]))).toBe("Body");
    expect(stripAllowedLeadingHeading("## Other\n\nBody", new Set(["description"]))).toBe("## Other\n\nBody");
  });

  test("reads subagent model options from metadata", () => {
    const metadata = {
      orion: {
        subagent: {
          model: "claude-sonnet-4-5",
          "disable-model-invocation": true,
        },
      },
    };

    expect(getSubagentModelId(metadata)).toBe("claude-sonnet-4-5");
    expect(getSubagentDisableModelInvocation(metadata)).toBe(true);
  });
});
