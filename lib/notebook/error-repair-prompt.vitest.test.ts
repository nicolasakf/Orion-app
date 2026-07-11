import { describe, expect, it } from "vitest";

import { buildNotebookErrorRepairPrompt } from "@/lib/notebook/error-repair-prompt";

describe("buildNotebookErrorRepairPrompt", () => {
  it("asks the agent to fix the cell error and verify the full notebook", () => {
    expect(buildNotebookErrorRepairPrompt("cell #2")).toBe(
      "Fix the error in cell #2, then run the whole notebook to make sure it completes successfully.",
    );
  });
});
