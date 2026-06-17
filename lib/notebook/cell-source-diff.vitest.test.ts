import { describe, expect, it } from "vitest";

import { computeCellSourceDelta, sourceToDiffLines } from "./cell-source-diff";

describe("cell-source-diff", () => {
  it("counts inserted cell lines", () => {
    const delta = computeCellSourceDelta(2, "", "a = 1\nb = 2");

    expect(delta).toMatchObject({
      cellIndex: 2,
      addedLines: 2,
      removedLines: 0,
    });
    expect(delta.diffText).toContain("+a = 1");
    expect(delta.diffText).toContain("+b = 2");
  });

  it("counts deleted cell lines", () => {
    const delta = computeCellSourceDelta(1, "a = 1\nb = 2", "");

    expect(delta.addedLines).toBe(0);
    expect(delta.removedLines).toBe(2);
    expect(delta.diffText).toContain("-a = 1");
    expect(delta.diffText).toContain("-b = 2");
  });

  it("counts replacements using line matching", () => {
    const delta = computeCellSourceDelta(
      4,
      "keep\nold one\nold two",
      "keep\nnew one\nnew two"
    );

    expect(delta.addedLines).toBe(2);
    expect(delta.removedLines).toBe(2);
    expect(delta.diffText).toContain(" keep");
    expect(delta.diffText).toContain("-old one");
    expect(delta.diffText).toContain("+new one");
  });

  it("treats empty cells as zero lines", () => {
    expect(sourceToDiffLines("")).toEqual([]);
    const delta = computeCellSourceDelta(0, "", "");

    expect(delta.addedLines).toBe(0);
    expect(delta.removedLines).toBe(0);
    expect(delta.diffText).toBe("no changes detected");
  });

  it("ignores a final trailing newline for source-line deltas", () => {
    const delta = computeCellSourceDelta(0, "print('hi')", "print('hi')\n");

    expect(delta.addedLines).toBe(0);
    expect(delta.removedLines).toBe(0);
    expect(delta.diffText).toBe("no changes detected");
  });

  it("reports no-op edits", () => {
    const delta = computeCellSourceDelta(3, "x = 1", "x = 1");

    expect(delta.addedLines).toBe(0);
    expect(delta.removedLines).toBe(0);
    expect(delta.diffText).toBe("no changes detected");
  });
});
