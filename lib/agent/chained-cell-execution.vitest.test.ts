import { describe, expect, it } from "vitest";

import {
  CHAINED_EXECUTION_BLOCKED_NOTE,
  runEditedCellsIfRequested,
  runInsertedCellsIfRequested,
  type ChainedCellExecutor,
} from "./chained-cell-execution";
import type { ExecuteCellParams, InsertCellParams, OverwriteCellSourceParams } from "./tools/types";
import type { ExecutionToolResult } from "./visual-evidence";

/** Records the calls a chained run makes so the tests can assert on them. */
function createExecutor(
  result: string[] | ExecutionToolResult = ["[Cell 0] 42"]
): ChainedCellExecutor & { calls: ExecuteCellParams[] } {
  const calls: ExecuteCellParams[] = [];
  return {
    calls,
    async execute(params) {
      calls.push(params);
      return result;
    },
  };
}

/** Builds edit params without repeating the metadata field at each call site. */
function editParams(
  cellIndices: number[],
  overrides: Partial<OverwriteCellSourceParams> = {}
): OverwriteCellSourceParams {
  return {
    cells: cellIndices.map((cellIndex) => ({
      cellIndex,
      newSource: "1 + 1",
      orionMetadataJson: "",
    })),
    ...overrides,
  };
}

/** Builds insert params for a run of code cells. */
function insertParams(
  cellTypes: Array<"code" | "markdown">,
  overrides: Partial<InsertCellParams> = {}
): InsertCellParams {
  return {
    cells: cellTypes.map((cellType) => ({
      cellType,
      cellSource: cellType === "code" ? "1 + 1" : "# heading",
      orionMetadataJson: "",
    })),
    startIndex: -1,
    ...overrides,
  };
}

describe("chained execution after an edit", () => {
  it("returns the edit untouched when execute is false", async () => {
    const executor = createExecutor();

    const result = await runEditedCellsIfRequested(
      executor,
      editParams([2], { execute: false }),
      "Cell 2 overwritten successfully!",
      true
    );

    expect(result).toBe("Cell 2 overwritten successfully!");
    expect(executor.calls).toHaveLength(0);
  });

  it("runs each edited cell once, in ascending order", async () => {
    // The schema allows the same index twice (last newSource wins), so a
    // repeated index must not queue the cell for a second kernel run.
    const executor = createExecutor();

    await runEditedCellsIfRequested(
      executor,
      editParams([5, 2, 5], { execute: true }),
      "edited",
      true
    );

    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]).toMatchObject({
      cellIndices: [2, 5],
      stream: false,
      timeoutSeconds: 120,
    });
  });

  it("honours an explicit timeout", async () => {
    const executor = createExecutor();

    await runEditedCellsIfRequested(
      executor,
      editParams([0], { execute: true, timeoutSeconds: 300 }),
      "edited",
      true
    );

    expect(executor.calls[0]?.timeoutSeconds).toBe(300);
  });

  it("merges the execution text onto the edit result", async () => {
    const executor = createExecutor(["[Cell 2] 42"]);

    const result = await runEditedCellsIfRequested(
      executor,
      editParams([2], { execute: true }),
      "Cell 2 overwritten successfully!",
      true
    );

    expect(result).toBe("Cell 2 overwritten successfully!\n\n[Cell 2] 42");
  });

  it("keeps the visuals when execution returns a structured result", async () => {
    const executionResult: ExecutionToolResult = {
      text: "[Cell 2] chart rendered",
      visuals: [
        {
          visualId: "v1",
          mimeType: "image/png",
          data: "abc",
          source: "execute_cell",
          cellIndex: 2,
          outputIndex: 0,
          byteLength: 3,
        },
      ],
    };
    const executor = createExecutor(executionResult);

    const result = await runEditedCellsIfRequested(
      executor,
      editParams([2], { execute: true }),
      "edited",
      true
    );

    expect(result).toMatchObject({
      text: "edited\n\n[Cell 2] chart rendered",
      visuals: executionResult.visuals,
    });
  });

  it("skips the kernel when the mode withholds execution", async () => {
    // Edit mode ships overwrite_cell_source without execute_cell, and its
    // prompt promises the model cannot run code.
    const executor = createExecutor();

    const result = await runEditedCellsIfRequested(
      executor,
      editParams([2], { execute: true }),
      "Cell 2 overwritten successfully!",
      false
    );

    expect(executor.calls).toHaveLength(0);
    expect(result).toBe(`Cell 2 overwritten successfully!\n\n${CHAINED_EXECUTION_BLOCKED_NOTE}`);
  });
});

describe("chained execution after an insert", () => {
  it("runs only the inserted code cells", async () => {
    const executor = createExecutor();

    await runInsertedCellsIfRequested(
      executor,
      insertParams(["markdown", "code"], { execute: true }),
      "2 cells inserted successfully at index 4!",
      true
    );

    expect(executor.calls[0]?.cellIndices).toEqual([5]);
  });

  it("says so when every inserted cell is markdown", async () => {
    const executor = createExecutor();

    const result = await runInsertedCellsIfRequested(
      executor,
      insertParams(["markdown"], { execute: true }),
      "1 cell inserted successfully at index 4!",
      true
    );

    expect(executor.calls).toHaveLength(0);
    expect(result).toContain("Nothing to execute");
  });

  it("passes a failed insert through without running anything", async () => {
    const executor = createExecutor();

    const result = await runInsertedCellsIfRequested(
      executor,
      insertParams(["code"], { execute: true }),
      "[ERROR] No current notebook is active. Use use_notebook first.",
      true
    );

    expect(executor.calls).toHaveLength(0);
    expect(result).toBe("[ERROR] No current notebook is active. Use use_notebook first.");
  });

  it("skips the kernel when the mode withholds execution", async () => {
    const executor = createExecutor();

    const result = await runInsertedCellsIfRequested(
      executor,
      insertParams(["code"], { execute: true }),
      "1 cell inserted successfully at index 4!",
      false
    );

    expect(executor.calls).toHaveLength(0);
    expect(result).toContain(CHAINED_EXECUTION_BLOCKED_NOTE);
  });
});
