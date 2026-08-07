import { describe, expect, it } from "vitest";

import { isProtectedMemoryWriteAttempt } from "./memory-write-guard";

describe("ORION.md alternate-write guard", () => {
  it("blocks file, shell, code, and notebook-source tools that reference ORION.md", () => {
    expect(
      isProtectedMemoryWriteAttempt("edit_file", {
        filePath: "/Users/example/.orion/ORION.md",
      }),
    ).toBe(true);
    expect(
      isProtectedMemoryWriteAttempt("bash", {
        command: "printf context > ~/.orion/ORION.md",
      }),
    ).toBe(true);
    expect(
      isProtectedMemoryWriteAttempt("execute_code", {
        code: "open('/tmp/ORION.md', 'w').write(context)",
      }),
    ).toBe(true);
    expect(
      isProtectedMemoryWriteAttempt("overwrite_cell_source", {
        cells: [{ newSource: "write_text('ORION.md')" }],
      }),
    ).toBe(true);
    expect(
      isProtectedMemoryWriteAttempt("bash", {
        command: "curl -X PUT http://localhost/api/onboarding/profile",
      }),
    ).toBe(true);
  });

  it("allows reads and unrelated mutations", () => {
    expect(
      isProtectedMemoryWriteAttempt("read_file", {
        filePath: "/Users/example/.orion/ORION.md",
      }),
    ).toBe(false);
    expect(
      isProtectedMemoryWriteAttempt("edit_file", { filePath: "/tmp/notes.md" }),
    ).toBe(false);
  });
});
