import { describe, expect, it } from "vitest";

import { parseInsertedRange } from "./insert-cell";

describe("parseInsertedRange", () => {
  it("reads back the range from a single-cell insert", () => {
    expect(parseInsertedRange("1 cell inserted successfully at index 7!\nNotebook now has 8 cells")).toEqual(
      { startIndex: 7, count: 1 }
    );
  });

  it("reads back the range from a multi-cell insert", () => {
    expect(
      parseInsertedRange("3 cells inserted successfully at index 0!\nNotebook now has 12 cells")
    ).toEqual({ startIndex: 0, count: 3 });
  });

  it("resolves an append, where the requested index was -1", () => {
    // The tool normalizes -1 to the cell count before reporting, so a caller
    // chaining execution onto an append still learns the real indices.
    expect(parseInsertedRange("2 cells inserted successfully at index 24!")).toEqual({
      startIndex: 24,
      count: 2,
    });
  });

  it("returns null for a failed insert", () => {
    expect(parseInsertedRange("[ERROR] No current notebook is active. Use use_notebook first.")).toBeNull();
  });

  it("returns null for unrelated output", () => {
    expect(parseInsertedRange("Notebook now has 8 cells")).toBeNull();
  });
});
