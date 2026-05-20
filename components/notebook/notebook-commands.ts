import type { NotebookCellType, NotebookType } from "@/lib/types";
import { CellType } from "@/lib/types";

export type CellId = string;

export interface CellSelectionState {
  selectedCellIds: Set<CellId>;
  selectionAnchorCellId: CellId | null;
  cellCursorId: CellId | null;
}

export interface NotebookCommandResult {
  notebook: NotebookType;
  selection: CellSelectionState;
}

/** Original cell payload plus insertion index captured before a delete. */
export interface DeletedCellSnapshot {
  index: number;
  cell: NotebookCellType;
}

export type CellIdFactory = () => CellId;

/** Creates a browser-safe random cell id. */
export function createCellId(): CellId {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Returns a cell's Orion id when it has one. */
export function getCellId(cell: NotebookCellType | undefined): CellId | null {
  const id = cell?.metadata?.orion?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Converts editor text to Jupyter's line-array source representation. */
export function sourceTextToLines(source: string): string[] {
  return source
    .split("\n")
    .map((line, index, array) =>
      index === array.length - 1 ? line : `${line}\n`,
    );
}

/** Returns a cell index by id, or -1 when the id is absent. */
export function getCellIndexById(notebook: NotebookType, cellId: CellId): number {
  return notebook.cells.findIndex((cell) => getCellId(cell) === cellId);
}

/** Returns a cell id by index, or null when the index is invalid. */
export function getCellIdByIndex(
  notebook: NotebookType | null,
  index: number | null,
): CellId | null {
  if (!notebook || index === null || index < 0 || index >= notebook.cells.length) {
    return null;
  }
  return getCellId(notebook.cells[index]);
}

/** Converts cell ids to current notebook indices, dropping missing ids. */
export function getCellIndicesByIds(
  notebook: NotebookType | null,
  cellIds: Iterable<CellId>,
): number[] {
  if (!notebook) return [];
  return Array.from(cellIds)
    .map((cellId) => getCellIndexById(notebook, cellId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
}

/** Converts current notebook indices to cell ids, dropping invalid indices. */
export function getCellIdsByIndices(
  notebook: NotebookType | null,
  indices: Iterable<number>,
): CellId[] {
  if (!notebook) return [];
  return Array.from(indices)
    .map((index) => getCellIdByIndex(notebook, index))
    .filter((id): id is CellId => id !== null);
}

/** Returns a selection object focused on one cell id. */
export function singleCellSelection(cellId: CellId | null): CellSelectionState {
  return {
    selectedCellIds: cellId ? new Set([cellId]) : new Set(),
    selectionAnchorCellId: cellId,
    cellCursorId: cellId,
  };
}

/** Repairs missing or duplicate cell ids while preserving all other notebook data. */
export function ensureUniqueCellIds(
  notebook: NotebookType,
  idFactory: CellIdFactory = createCellId,
): NotebookType {
  const seen = new Set<CellId>();
  let changed = false;

  const cells = notebook.cells.map((cell) => {
    const currentId = getCellId(cell);
    if (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      return cell;
    }

    let nextId = idFactory();
    while (seen.has(nextId)) {
      nextId = idFactory();
    }
    seen.add(nextId);
    changed = true;

    return {
      ...cell,
      metadata: {
        ...(cell.metadata ?? {}),
        orion: {
          ...(cell.metadata?.orion ?? {}),
          id: nextId,
        },
      },
    };
  });

  return changed ? { ...notebook, cells } : notebook;
}

/** Applies pending editor source text to cells by id. */
export function applyPendingSourceChangesById(
  notebook: NotebookType,
  pendingSourceByCellId: ReadonlyMap<CellId, string>,
): NotebookType {
  if (pendingSourceByCellId.size === 0) return notebook;

  let changed = false;
  const cells = notebook.cells.map((cell) => {
    const cellId = getCellId(cell);
    if (!cellId || !pendingSourceByCellId.has(cellId)) return cell;
    changed = true;
    return {
      ...cell,
      source: sourceTextToLines(pendingSourceByCellId.get(cellId) ?? ""),
    };
  });

  return changed ? { ...notebook, cells } : notebook;
}

/** Creates a new empty notebook cell with a fresh Orion id. */
export function createNotebookCell(
  cellType: CellType = CellType.CODE,
  idFactory: CellIdFactory = createCellId,
): NotebookCellType {
  const cell: NotebookCellType = {
    cell_type: cellType,
    metadata: { orion: { id: idFactory() } },
    source: [""],
  };

  if (cellType === CellType.CODE) {
    cell.outputs = [];
    cell.execution_count = null;
  }

  return cell;
}

/** Clones a cell and assigns a fresh Orion id. */
export function cloneCellWithFreshId(
  cell: NotebookCellType,
  idFactory: CellIdFactory = createCellId,
): NotebookCellType {
  const cloned = JSON.parse(JSON.stringify(cell)) as NotebookCellType;
  cloned.metadata = {
    ...(cloned.metadata ?? {}),
    orion: {
      ...(cloned.metadata?.orion ?? {}),
      id: idFactory(),
    },
  };
  return cloned;
}

/** Inserts one new cell above or below a base cell id. */
export function insertCellById(
  notebook: NotebookType,
  baseCellId: CellId | null,
  position: "above" | "below",
  cellType: CellType = CellType.CODE,
  idFactory: CellIdFactory = createCellId,
): NotebookCommandResult & { insertedCellId: CellId } {
  const cells = notebook.cells.slice();
  const baseIndex = baseCellId ? getCellIndexById(notebook, baseCellId) : -1;
  const insertIndex =
    baseIndex === -1
      ? cells.length
      : position === "above"
        ? baseIndex
        : baseIndex + 1;
  const clampedIndex = Math.max(0, Math.min(insertIndex, cells.length));
  const newCell = createNotebookCell(cellType, idFactory);
  const insertedCellId = getCellId(newCell) as CellId;

  cells.splice(clampedIndex, 0, newCell);

  return {
    notebook: { ...notebook, cells },
    selection: singleCellSelection(insertedCellId),
    insertedCellId,
  };
}

/** Deletes cells by id and returns a nearby stable selection. */
export function deleteCellsById(
  notebook: NotebookType,
  cellIdsToDelete: Iterable<CellId>,
  cursorCellId: CellId | null,
): NotebookCommandResult {
  const deleteSet = new Set(cellIdsToDelete);
  if (deleteSet.size === 0) {
    return { notebook, selection: clampSelectionToNotebook(notebook, singleCellSelection(cursorCellId)) };
  }

  const originalCursorIndex = cursorCellId ? getCellIndexById(notebook, cursorCellId) : -1;
  const cells = notebook.cells.filter((cell) => {
    const cellId = getCellId(cell);
    return !cellId || !deleteSet.has(cellId);
  });

  let nextCursorId: CellId | null = null;
  if (cells.length > 0) {
    const nextIndex = Math.min(Math.max(originalCursorIndex, 0), cells.length - 1);
    nextCursorId = getCellId(cells[nextIndex]);
  }

  const nextNotebook = { ...notebook, cells };
  return {
    notebook: nextNotebook,
    selection: singleCellSelection(nextCursorId),
  };
}

/** Restores deleted cells near their original indices and selects them. */
export function restoreCellsByOriginalIndex(
  notebook: NotebookType,
  snapshots: DeletedCellSnapshot[],
  idFactory: CellIdFactory = createCellId,
): NotebookCommandResult & { restoredCellIds: CellId[] } {
  if (snapshots.length === 0) {
    return {
      notebook,
      selection: clampSelectionToNotebook(notebook, singleCellSelection(null)),
      restoredCellIds: [],
    };
  }

  const cells = notebook.cells.slice();
  const existingIds = new Set(
    cells
      .map((cell) => getCellId(cell))
      .filter((id): id is CellId => id !== null),
  );
  const restoredCellIds: CellId[] = [];

  for (const snapshot of snapshots
    .slice()
    .sort((a, b) => a.index - b.index)) {
    const snapshotCellId = getCellId(snapshot.cell);
    const restoredCell =
      snapshotCellId && !existingIds.has(snapshotCellId)
        ? (JSON.parse(JSON.stringify(snapshot.cell)) as NotebookCellType)
        : cloneCellWithFreshId(snapshot.cell, idFactory);
    const restoredCellId = getCellId(restoredCell);

    if (restoredCellId) {
      existingIds.add(restoredCellId);
      restoredCellIds.push(restoredCellId);
    }

    const insertIndex = Math.max(0, Math.min(snapshot.index, cells.length));
    cells.splice(insertIndex, 0, restoredCell);
  }

  return {
    notebook: { ...notebook, cells },
    selection: {
      selectedCellIds: new Set(restoredCellIds),
      selectionAnchorCellId: restoredCellIds[0] ?? null,
      cellCursorId: restoredCellIds[0] ?? null,
    },
    restoredCellIds,
  };
}

/** Moves one cell by id and keeps selection on the moved cell. */
export function moveCellById(
  notebook: NotebookType,
  cellId: CellId,
  direction: "up" | "down",
): NotebookCommandResult {
  const currentIndex = getCellIndexById(notebook, cellId);
  if (currentIndex === -1) {
    return { notebook, selection: singleCellSelection(null) };
  }

  const nextIndex =
    direction === "up"
      ? Math.max(0, currentIndex - 1)
      : Math.min(notebook.cells.length - 1, currentIndex + 1);
  if (nextIndex === currentIndex) {
    return { notebook, selection: singleCellSelection(cellId) };
  }

  const cells = notebook.cells.slice();
  const [movedCell] = cells.splice(currentIndex, 1);
  cells.splice(nextIndex, 0, movedCell);

  return {
    notebook: { ...notebook, cells },
    selection: singleCellSelection(cellId),
  };
}

/** Changes selected cells to the target cell type. */
export function changeCellTypesById(
  notebook: NotebookType,
  cellIdsToChange: Iterable<CellId>,
  targetType: CellType,
): NotebookCommandResult & { changedCellIds: CellId[] } {
  const changeSet = new Set(cellIdsToChange);
  const changedCellIds: CellId[] = [];

  const cells = notebook.cells.map((cell) => {
    const cellId = getCellId(cell);
    if (!cellId || !changeSet.has(cellId) || cell.cell_type === targetType) {
      return cell;
    }

    const updated: NotebookCellType = { ...cell, cell_type: targetType };
    if (targetType === CellType.CODE) {
      updated.outputs = updated.outputs ?? [];
      updated.execution_count = updated.execution_count ?? null;
    } else {
      delete updated.outputs;
      delete updated.execution_count;
    }
    changedCellIds.push(cellId);
    return updated;
  });

  const nextNotebook =
    changedCellIds.length > 0 ? { ...notebook, cells } : notebook;
  const firstSelectedId = Array.from(changeSet).find(
    (cellId) => getCellIndexById(nextNotebook, cellId) >= 0,
  ) ?? null;

  return {
    notebook: nextNotebook,
    selection: clampSelectionToNotebook(nextNotebook, {
      selectedCellIds: changeSet,
      selectionAnchorCellId: firstSelectedId,
      cellCursorId: firstSelectedId,
    }),
    changedCellIds,
  };
}

/** Duplicates one cell below itself with a fresh id. */
export function duplicateCellById(
  notebook: NotebookType,
  cellId: CellId,
  idFactory: CellIdFactory = createCellId,
): NotebookCommandResult & { duplicatedCellId: CellId | null } {
  const index = getCellIndexById(notebook, cellId);
  if (index === -1) {
    return { notebook, selection: singleCellSelection(null), duplicatedCellId: null };
  }

  const duplicate = cloneCellWithFreshId(notebook.cells[index], idFactory);
  const duplicatedCellId = getCellId(duplicate);
  const cells = notebook.cells.slice();
  cells.splice(index + 1, 0, duplicate);

  return {
    notebook: { ...notebook, cells },
    selection: singleCellSelection(duplicatedCellId),
    duplicatedCellId,
  };
}

/** Pastes cloned cells at the target index and selects the pasted cells. */
export function pasteCellsAtIndex(
  notebook: NotebookType,
  cellsToPaste: NotebookCellType[],
  insertAtIndex: number,
  idFactory: CellIdFactory = createCellId,
): NotebookCommandResult & { pastedCellIds: CellId[] } {
  if (cellsToPaste.length === 0) {
    return { notebook, selection: singleCellSelection(null), pastedCellIds: [] };
  }

  const pastedCells = cellsToPaste.map((cell) =>
    cloneCellWithFreshId(cell, idFactory),
  );
  const pastedCellIds = pastedCells
    .map((cell) => getCellId(cell))
    .filter((id): id is CellId => id !== null);
  const cells = notebook.cells.slice();
  const clampedIndex = Math.max(0, Math.min(insertAtIndex, cells.length));
  cells.splice(clampedIndex, 0, ...pastedCells);

  return {
    notebook: { ...notebook, cells },
    selection: {
      selectedCellIds: new Set(pastedCellIds),
      selectionAnchorCellId: pastedCellIds[0] ?? null,
      cellCursorId: pastedCellIds[0] ?? null,
    },
    pastedCellIds,
  };
}

/** Removes missing ids from selection and falls back to a valid cursor when possible. */
export function clampSelectionToNotebook(
  notebook: NotebookType | null,
  selection: CellSelectionState,
): CellSelectionState {
  if (!notebook || notebook.cells.length === 0) {
    return singleCellSelection(null);
  }

  const existingIds = new Set(
    notebook.cells
      .map((cell) => getCellId(cell))
      .filter((id): id is CellId => id !== null),
  );
  const selectedCellIds = new Set(
    Array.from(selection.selectedCellIds).filter((id) => existingIds.has(id)),
  );
  const cellCursorId =
    selection.cellCursorId && existingIds.has(selection.cellCursorId)
      ? selection.cellCursorId
      : selectedCellIds.values().next().value ?? getCellId(notebook.cells[0]);
  const selectionAnchorCellId =
    selection.selectionAnchorCellId &&
    existingIds.has(selection.selectionAnchorCellId)
      ? selection.selectionAnchorCellId
      : cellCursorId;

  if (selectedCellIds.size === 0 && cellCursorId) {
    selectedCellIds.add(cellCursorId);
  }

  return {
    selectedCellIds,
    selectionAnchorCellId,
    cellCursorId,
  };
}
