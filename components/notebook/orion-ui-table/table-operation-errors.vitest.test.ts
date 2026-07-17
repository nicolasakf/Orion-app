import { describe, expect, it } from "vitest";

import {
  formatTableOperationError,
  missingKernelMessage,
  tableNotRegisteredMessage,
} from "./table-operation-errors";

describe("table operation errors", () => {
  it("describes fetch failures when the table is not loaded in the kernel", () => {
    expect(tableNotRegisteredMessage("fetch")).toContain("sort, filter, search");
    expect(tableNotRegisteredMessage("fetch")).toContain(
      "Run the cell that displays this table",
    );
  });

  it("uses report refresh guidance in business view", () => {
    expect(tableNotRegisteredMessage("fetch", "business")).toBe(
      "Refresh this report to sort, filter, or explore this table.",
    );
    expect(tableNotRegisteredMessage("export_csv", "business")).toContain(
      "export or copy",
    );
    expect(missingKernelMessage("business")).toBe(
      "Connect Orion's runtime, then refresh this report.",
    );
  });

  it("maps legacy backend registration errors to action-specific guidance", () => {
    const error = new Error(
      "Orion table is no longer registered in the kernel: orion-table-abc",
    );

    expect(formatTableOperationError("export_csv", error)).toContain("export");
    expect(formatTableOperationError("stats", error)).toContain(
      "column statistics",
    );
    expect(formatTableOperationError("export_csv", error)).not.toContain(
      "orion-table-abc",
    );
    expect(formatTableOperationError("fetch", error, "business")).toBe(
      "Refresh this report to sort, filter, or explore this table.",
    );
  });

  it("maps missing-kernel transport errors to a setup message", () => {
    expect(
      formatTableOperationError(
        "fetch",
        new Error("No active kernel is available for table operations."),
      ),
    ).toBe(missingKernelMessage());
    expect(
      formatTableOperationError(
        "fetch",
        new Error("No active kernel is available for table operations."),
        "business",
      ),
    ).toBe(missingKernelMessage("business"));
  });

  it("remaps backend pro messages for business view", () => {
    const friendly =
      "This table is showing saved output. Run the cell that displays this table.";
    expect(formatTableOperationError("fetch", new Error(friendly), "business")).toBe(
      "Refresh this report to sort, filter, or explore this table.",
    );
  });
});
