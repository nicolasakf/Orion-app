import { useState, useCallback } from "react";

import type { CellPosition, SelectionType } from "../types";
import { cellKey } from "../utils";

/** Manages cell, row, and column selection with mouse handlers */
export function useTableSelection(
  visibleColumns: string[],
  processedData: Record<string, string>[]
) {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set()
  );
  const [selectionType, setSelectionType] = useState<SelectionType>("none");
  const [selectionStart, setSelectionStart] = useState<CellPosition | null>(
    null
  );
  const [selectionEnd, setSelectionEnd] = useState<CellPosition | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [currentCell, setCurrentCell] = useState<CellPosition | null>(null);

  const resetSelection = useCallback(() => {
    setSelectedCells(new Set());
    setSelectedRows(new Set());
    setSelectedColumns(new Set());
    setSelectionType("none");
    setSelectionStart(null);
    setSelectionEnd(null);
  }, []);

  const selectEntireRow = useCallback(
    (rowIndex: number) => {
      const newSelectedCells = new Set<string>();
      visibleColumns.forEach((colName) =>
        newSelectedCells.add(cellKey(rowIndex, colName))
      );
      setSelectedCells(newSelectedCells);
      setSelectionType("row");
      setSelectedRows(new Set([rowIndex]));
      setSelectedColumns(new Set());
    },
    [visibleColumns]
  );

  const selectEntireColumn = useCallback(
    (colName: string) => {
      const newSelectedCells = new Set<string>();
      processedData.forEach((_, rowIndex) =>
        newSelectedCells.add(cellKey(rowIndex, colName))
      );
      setSelectedCells(newSelectedCells);
      setSelectionType("column");
      setSelectedColumns(new Set([colName]));
      setSelectedRows(new Set());
    },
    [processedData]
  );

  const moveCurrentCell = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (!currentCell) return;
      let { rowIndex, colName } = currentCell;
      const colIndex = visibleColumns.indexOf(colName);
      switch (direction) {
        case "up":
          rowIndex = Math.max(0, rowIndex - 1);
          break;
        case "down":
          rowIndex = Math.min(processedData.length - 1, rowIndex + 1);
          break;
        case "left":
          if (colIndex > 0) colName = visibleColumns[colIndex - 1];
          break;
        case "right":
          if (colIndex < visibleColumns.length - 1)
            colName = visibleColumns[colIndex + 1];
          break;
      }
      setCurrentCell({ rowIndex, colName });
      setSelectedCells(new Set([cellKey(rowIndex, colName)]));
      setSelectionType("cell");
      setSelectionStart({ rowIndex, colName });
      setSelectionEnd({ rowIndex, colName });
    },
    [currentCell, visibleColumns, processedData.length]
  );

  /** Bug fix: accepts MouseEvent parameter instead of using window.event */
  const handleCellMouseDown = useCallback(
    (rowIndex: number, colName: string, e: React.MouseEvent) => {
      setIsSelecting(true);
      const key = cellKey(rowIndex, colName);
      setCurrentCell({ rowIndex, colName });

      if (e.ctrlKey || e.metaKey) {
        setSelectionType("multiple");
        setSelectedCells((prev) => {
          const newSet = new Set(prev);
          newSet.has(key) ? newSet.delete(key) : newSet.add(key);
          return newSet;
        });
      } else {
        resetSelection();
        setSelectionType("cell");
        setSelectedCells(new Set([key]));
        setSelectionStart({ rowIndex, colName });
        setSelectionEnd({ rowIndex, colName });
      }
    },
    [resetSelection]
  );

  const handleCellMouseEnter = useCallback(
    (rowIndex: number, colName: string) => {
      if (!isSelecting || !selectionStart) return;
      setSelectionEnd({ rowIndex, colName });
      const newSelectedCells = new Set<string>();
      const startRow = Math.min(selectionStart.rowIndex, rowIndex);
      const endRow = Math.max(selectionStart.rowIndex, rowIndex);
      const startColIndex = visibleColumns.indexOf(selectionStart.colName);
      const endColIndex = visibleColumns.indexOf(colName);
      const startCol = Math.min(startColIndex, endColIndex);
      const endCol = Math.max(startColIndex, endColIndex);
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          newSelectedCells.add(cellKey(r, visibleColumns[c]));
        }
      }
      setSelectedCells(newSelectedCells);
    },
    [isSelecting, selectionStart, visibleColumns]
  );

  const handleCellMouseUp = useCallback(() => setIsSelecting(false), []);

  /** Bug fix: accepts MouseEvent parameter instead of using window.event */
  const handleRowSelect = useCallback(
    (rowIndex: number, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setSelectedRows((prev) => {
          const newSet = new Set(prev);
          newSet.has(rowIndex) ? newSet.delete(rowIndex) : newSet.add(rowIndex);
          return newSet;
        });
        setSelectionType("row");
      } else {
        resetSelection();
        selectEntireRow(rowIndex);
      }
    },
    [resetSelection, selectEntireRow]
  );

  /** Bug fix: accepts MouseEvent parameter instead of using window.event */
  const handleColumnSelect = useCallback(
    (colName: string, e?: React.MouseEvent) => {
      if (e?.ctrlKey || e?.metaKey) {
        setSelectedColumns((prev) => {
          const newSet = new Set(prev);
          newSet.has(colName) ? newSet.delete(colName) : newSet.add(colName);
          return newSet;
        });
        setSelectionType("column");
      } else {
        resetSelection();
        selectEntireColumn(colName);
      }
    },
    [resetSelection, selectEntireColumn]
  );

  const selectAll = useCallback(() => {
    const allCells = new Set<string>();
    processedData.forEach((_, rowIndex) => {
      visibleColumns.forEach((colName) =>
        allCells.add(cellKey(rowIndex, colName))
      );
    });
    setSelectedCells(allCells);
    setSelectionType("multiple");
  }, [processedData, visibleColumns]);

  const extendSelection = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (!currentCell || !selectionStart) return;
      const endPos = selectionEnd || currentCell;
      let newEndRow = endPos.rowIndex;
      let newEndColIndex = visibleColumns.indexOf(endPos.colName);

      switch (direction) {
        case "up":
          newEndRow = Math.max(0, newEndRow - 1);
          break;
        case "down":
          newEndRow = Math.min(processedData.length - 1, newEndRow + 1);
          break;
        case "left":
          newEndColIndex = Math.max(0, newEndColIndex - 1);
          break;
        case "right":
          newEndColIndex = Math.min(
            visibleColumns.length - 1,
            newEndColIndex + 1
          );
          break;
      }

      const newEndColName = visibleColumns[newEndColIndex];
      setSelectionEnd({ rowIndex: newEndRow, colName: newEndColName });

      const startRow = Math.min(selectionStart.rowIndex, newEndRow);
      const endRow = Math.max(selectionStart.rowIndex, newEndRow);
      const startColIdx = Math.min(
        visibleColumns.indexOf(selectionStart.colName),
        newEndColIndex
      );
      const endColIdx = Math.max(
        visibleColumns.indexOf(selectionStart.colName),
        newEndColIndex
      );

      const newSelectedCells = new Set<string>();
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startColIdx; c <= endColIdx; c++) {
          newSelectedCells.add(cellKey(r, visibleColumns[c]));
        }
      }
      setSelectedCells(newSelectedCells);
      setSelectionType("multiple");
    },
    [currentCell, selectionStart, selectionEnd, visibleColumns, processedData.length]
  );

  return {
    selectedCells,
    selectedRows,
    selectedColumns,
    selectionType,
    currentCell,
    setCurrentCell,
    selectionStart,
    setSelectionStart,
    selectionEnd,
    setSelectionEnd,
    isSelecting,
    resetSelection,
    selectEntireRow,
    selectEntireColumn,
    moveCurrentCell,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellMouseUp,
    handleRowSelect,
    handleColumnSelect,
    selectAll,
    extendSelection,
    setSelectedCells,
    setSelectionType,
  };
}
