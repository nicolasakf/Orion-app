import { describe, expect, test } from "vitest";

import type { NotebookCellType, NotebookType } from "@/lib/types";
import { CellType } from "@/lib/types";

import {
  applyPendingSourceChangesById,
  changeCellTypesById,
  deleteCellsById,
  duplicateCellById,
  ensureUniqueCellIds,
  getCellId,
  insertCellById,
  moveCellById,
  pasteCellsAtIndex,
  restoreCellsByOriginalIndex,
} from "./notebook-commands";

function makeIdFactory(ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function cell(id: string, source: string, type = CellType.CODE): NotebookCellType {
  const base: NotebookCellType = {
    cell_type: type,
    metadata: { orion: { id } },
    source: [source],
  };
  if (type === CellType.CODE) {
    base.outputs = [];
    base.execution_count = null;
  }
  return base;
}

function notebook(cells: NotebookCellType[]): NotebookType {
  return {
    cells,
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
}

function ids(nb: NotebookType): string[] {
  return nb.cells.map((item) => getCellId(item) ?? "");
}

describe("notebook identity commands", () => {
  test("repairs missing and duplicate cell ids", () => {
    const duplicate = cell("a", "duplicate");
    const missing = { ...cell("missing", "missing"), metadata: {} };
    const result = ensureUniqueCellIds(
      notebook([cell("a", "one"), duplicate, missing]),
      makeIdFactory(["b", "c"]),
    );

    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  test("inserts above and below while selecting the inserted id", () => {
    const initial = notebook([cell("a", "one"), cell("b", "two")]);

    const above = insertCellById(initial, "b", "above", CellType.CODE, makeIdFactory(["x"]));
    expect(ids(above.notebook)).toEqual(["a", "x", "b"]);
    expect(above.selection.cellCursorId).toBe("x");

    const below = insertCellById(above.notebook, "x", "below", CellType.MARKDOWN, makeIdFactory(["y"]));
    expect(ids(below.notebook)).toEqual(["a", "x", "y", "b"]);
    expect(below.notebook.cells[2].cell_type).toBe(CellType.MARKDOWN);
    expect(below.selection.selectedCellIds.has("y")).toBe(true);
  });

  test("deletes exactly the selected ids after an insert", () => {
    const inserted = insertCellById(
      notebook([cell("a", "one"), cell("b", "two")]),
      "a",
      "below",
      CellType.CODE,
      makeIdFactory(["x"]),
    );

    const deleted = deleteCellsById(
      inserted.notebook,
      inserted.selection.selectedCellIds,
      inserted.selection.cellCursorId,
    );

    expect(ids(deleted.notebook)).toEqual(["a", "b"]);
    expect(deleted.notebook.cells.map((item) => item.source.join(""))).toEqual([
      "one",
      "two",
    ]);
  });

  test("moves a cell and then deletes the moved cell, not its old neighbor", () => {
    const moved = moveCellById(
      notebook([cell("a", "one"), cell("b", "two"), cell("c", "three")]),
      "b",
      "down",
    );
    expect(ids(moved.notebook)).toEqual(["a", "c", "b"]);

    const deleted = deleteCellsById(moved.notebook, ["b"], "b");
    expect(ids(deleted.notebook)).toEqual(["a", "c"]);
    expect(deleted.notebook.cells.map((item) => item.source.join(""))).toEqual([
      "one",
      "three",
    ]);
  });

  test("restores deleted cells at their original positions", () => {
    const initial = notebook([
      cell("a", "one"),
      cell("b", "two"),
      cell("c", "three"),
      cell("d", "four"),
    ]);
    const deleted = deleteCellsById(initial, ["b", "c"], "b");

    const restored = restoreCellsByOriginalIndex(deleted.notebook, [
      { index: 1, cell: initial.cells[1] },
      { index: 2, cell: initial.cells[2] },
    ]);

    expect(ids(restored.notebook)).toEqual(["a", "b", "c", "d"]);
    expect(restored.restoredCellIds).toEqual(["b", "c"]);
    expect(Array.from(restored.selection.selectedCellIds)).toEqual(["b", "c"]);
    expect(restored.selection.cellCursorId).toBe("b");
  });

  test("restores deleted cells into an empty notebook", () => {
    const initial = notebook([cell("a", "one")]);
    const deleted = deleteCellsById(initial, ["a"], "a");

    const restored = restoreCellsByOriginalIndex(deleted.notebook, [
      { index: 0, cell: initial.cells[0] },
    ]);

    expect(ids(restored.notebook)).toEqual(["a"]);
    expect(restored.selection.cellCursorId).toBe("a");
  });

  test("duplicates and pastes cells with fresh ids", () => {
    const initial = notebook([cell("a", "one"), cell("b", "two")]);
    const duplicated = duplicateCellById(initial, "a", makeIdFactory(["copy-a"]));
    expect(ids(duplicated.notebook)).toEqual(["a", "copy-a", "b"]);
    expect(duplicated.notebook.cells[1].source).toEqual(["one"]);

    const pasted = pasteCellsAtIndex(
      duplicated.notebook,
      [duplicated.notebook.cells[0], duplicated.notebook.cells[1]],
      3,
      makeIdFactory(["paste-a", "paste-copy-a"]),
    );

    expect(ids(pasted.notebook)).toEqual([
      "a",
      "copy-a",
      "b",
      "paste-a",
      "paste-copy-a",
    ]);
    expect(new Set(ids(pasted.notebook)).size).toBe(pasted.notebook.cells.length);
  });

  test("changes type only for selected ids and preserves source", () => {
    const initial = notebook([
      cell("a", "code"),
      cell("b", "markdown", CellType.MARKDOWN),
      cell("c", "other"),
    ]);

    const result = changeCellTypesById(initial, ["b"], CellType.CODE);

    expect(result.changedCellIds).toEqual(["b"]);
    expect(result.notebook.cells.map((item) => item.cell_type)).toEqual([
      CellType.CODE,
      CellType.CODE,
      CellType.CODE,
    ]);
    expect(result.notebook.cells[1].source).toEqual(["markdown"]);
    expect(result.notebook.cells[0].source).toEqual(["code"]);
  });

  test("pending edits stay attached to cell ids across structural changes", () => {
    const initial = notebook([cell("a", "one"), cell("b", "two")]);
    const inserted = insertCellById(initial, "a", "below", CellType.CODE, makeIdFactory(["x"]));
    const moved = moveCellById(inserted.notebook, "b", "up");
    const pending = new Map([
      ["a", "edited one"],
      ["b", "edited two"],
    ]);

    const applied = applyPendingSourceChangesById(moved.notebook, pending);

    expect(ids(applied)).toEqual(["a", "b", "x"]);
    expect(applied.cells.map((item) => item.source.join(""))).toEqual([
      "edited one",
      "edited two",
      "",
    ]);
  });
});
