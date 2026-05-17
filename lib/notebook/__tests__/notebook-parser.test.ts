/**
 * Tests for notebook-parser.ts
 *
 * Run with: npx tsx lib/notebook/__tests__/notebook-parser.test.ts
 */

import { parseNotebook } from "../notebook-parser";

import { CellType } from "@/lib/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function test(name: string, fn: () => void) {
  console.log(`\n${name}`);
  try {
    fn();
  } catch (error) {
    failed++;
    console.error(`  ERROR: ${error}`);
  }
}

// =========================================================================

test("Empty content returns empty notebook", () => {
  const result = parseNotebook("");
  assert(result.cells.length === 0, "should have 0 cells");
  assert(result.nbformat === 0, "nbformat should be 0");
});

test("Valid notebook parses correctly", () => {
  const notebook = {
    cells: [
      { cell_type: "code", source: ["print('hello')"], metadata: {}, outputs: [], execution_count: 1 },
      { cell_type: "markdown", source: ["# Title"], metadata: {} },
    ],
    metadata: { kernelspec: { name: "python3" } },
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(result.cells.length === 2, "should have 2 cells");
  assert(result.cells[0].cell_type === CellType.CODE, "first cell should be code");
  assert(result.cells[1].cell_type === CellType.MARKDOWN, "second cell should be markdown");
  assert(result.cells[0].source[0] === "print('hello')", "source preserved");
  assert(result.nbformat === 4, "nbformat should be 4");
});

test("Source as string is normalized to array", () => {
  const notebook = {
    cells: [
      { cell_type: "code", source: "line1\nline2\nline3", metadata: {}, outputs: [] },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(Array.isArray(result.cells[0].source), "source should be array");
  assert(result.cells[0].source.length === 3, "should have 3 lines");
  assert(result.cells[0].source[0] === "line1\n", "first line should have newline");
  assert(result.cells[0].source[2] === "line3", "last line should not have newline");
});

test("Missing source defaults to empty array", () => {
  const notebook = {
    cells: [
      { cell_type: "code", metadata: {} },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(Array.isArray(result.cells[0].source), "source should be array");
  assert(result.cells[0].source.length === 1, "should have 1 element");
  assert(result.cells[0].source[0] === "", "should be empty string");
});

test("Invalid cell_type defaults to raw", () => {
  const notebook = {
    cells: [
      { cell_type: "something_weird", source: ["test"], metadata: {} },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(result.cells[0].cell_type === CellType.RAW, "should default to raw");
});

test("Missing cells array is treated as empty", () => {
  const notebook = {
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(result.cells.length === 0, "should have 0 cells");
  assert(result.nbformat === 4, "nbformat preserved");
});

test("Missing nbformat defaults to 4", () => {
  const notebook = {
    cells: [],
    metadata: {},
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(result.nbformat === 4, "should default to 4");
  assert(result.nbformat_minor === 5, "should default to 5");
});

test("Corrupted JSON with valid cells array recovers cells", () => {
  // Simulate a notebook where the overall JSON is broken but cells section is parseable
  const corrupted = `{
    "cells": [
      {"cell_type": "code", "source": ["print('hello')"], "metadata": {}, "outputs": []},
      {"cell_type": "markdown", "source": ["# Works"], "metadata": {}}
    ],
    "metadata": {"broken": },
    "nbformat": 4,
    "nbformat_minor": 5
  }`;
  const result = parseNotebook(corrupted);
  assert(result.cells.length >= 2, `should recover at least 2 cells (got ${result.cells.length})`);
  const validCells = result.cells.filter(
    (c) => !(c.metadata as any)?.orion?._parseError
  );
  assert(validCells.length === 2, `should have 2 valid cells (got ${validCells.length})`);
});

test("Completely invalid JSON returns error cell", () => {
  const result = parseNotebook("this is not json at all");
  assert(result.cells.length >= 1, "should have at least 1 cell");
  const errorCell = result.cells.find(
    (c) => (c.metadata as any)?.orion?._parseError
  );
  assert(!!errorCell, "should have an error cell");
});

test("Corrupted cell within valid JSON structure is marked as error", () => {
  // The overall JSON is valid but has a cell that's not an object
  const notebook = {
    cells: [
      { cell_type: "code", source: ["good cell"], metadata: {}, outputs: [] },
      "this is not a cell object",
      { cell_type: "markdown", source: ["also good"], metadata: {} },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(result.cells.length === 3, "should have 3 cells");
  assert(
    !(result.cells[0].metadata as any)?.orion?._parseError,
    "first cell should not be error"
  );
  assert(
    !!(result.cells[1].metadata as any)?.orion?._parseError,
    "second cell should be error"
  );
  assert(
    !(result.cells[2].metadata as any)?.orion?._parseError,
    "third cell should not be error"
  );
});

test("Partially corrupted JSON with one bad cell recovers others", () => {
  // JSON where one cell has broken syntax but others are fine
  const corrupted = `{
    "cells": [
      {"cell_type": "code", "source": ["good cell 1"], "metadata": {}, "outputs": []},
      {"cell_type": "code", "source": [bad syntax here], "metadata": {}},
      {"cell_type": "markdown", "source": ["good cell 3"], "metadata": {}}
    ],
    "metadata": {},
    "nbformat": 4,
    "nbformat_minor": 5
  }`;
  const result = parseNotebook(corrupted);
  assert(result.cells.length >= 2, `should have at least 2 cells (got ${result.cells.length})`);
  const validCells = result.cells.filter(
    (c) => !(c.metadata as any)?.orion?._parseError
  );
  assert(validCells.length >= 2, `should recover at least 2 valid cells (got ${validCells.length})`);
});

test("Code cells get outputs and execution_count normalized", () => {
  const notebook = {
    cells: [
      { cell_type: "code", source: ["x = 1"], metadata: {} },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(Array.isArray(result.cells[0].outputs), "code cell should have outputs array");
  assert(result.cells[0].execution_count === null, "code cell should have null execution_count");
});

test("Notebook metadata extraction from corrupted JSON", () => {
  const corrupted = `{
    "cells": [
      {"cell_type": "code", "source": ["test"], "metadata": {}}
    ],
    "metadata": {"broken": },
    "nbformat": 4,
    "nbformat_minor": 2
  }`;
  const result = parseNotebook(corrupted);
  assert(result.nbformat === 4, "should recover nbformat");
  assert(result.nbformat_minor === 2, "should recover nbformat_minor");
});

test("Empty cells array results in empty cells", () => {
  const notebook = {
    cells: [],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  const result = parseNotebook(JSON.stringify(notebook));
  assert(result.cells.length === 0, "should have 0 cells");
});

// =========================================================================

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
