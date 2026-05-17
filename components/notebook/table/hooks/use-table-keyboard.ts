import { useEffect, useRef, useCallback } from "react";

import type { CellPosition, FilterOperation } from "../types";
import { parseCellKey } from "../utils";
import { FILTER_FOCUS_DELAY_MS } from "../constants";

interface UseTableKeyboardArgs {
  tableRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  selectedCells: Set<string>;
  visibleColumns: string[];
  processedData: Record<string, string>[];
  fullscreenMode: boolean;
  selectionStart: CellPosition | null;
  selectionEnd: CellPosition | null;
  currentCell: CellPosition | null;
  selectedRows: Set<number>;
  selectedColumns: Set<string>;
  // Actions
  moveCurrentCell: (direction: "up" | "down" | "left" | "right") => void;
  extendSelection: (direction: "up" | "down" | "left" | "right") => void;
  selectAll: () => void;
  selectEntireRow: (rowIndex: number) => void;
  selectEntireColumn: (colName: string) => void;
  setCurrentCell: (pos: CellPosition) => void;
  setSelectedCells: (cells: Set<string>) => void;
  setSelectionType: (type: "cell" | "multiple") => void;
  setSelectionStart: (pos: CellPosition) => void;
  setSelectionEnd: (pos: CellPosition) => void;
  resetSelection: () => void;
  handleSort: (key: string) => void;
  handleGroupChange: (column: string | null) => void;
  showColumnStats: (column: string) => void;
  copyToClipboard: () => void;
  exportToExcel: () => void;
  transposeSelectedRow: () => void;
  filterBySelection: () => void;
  setActiveFilterColumn: (column: string | null) => void;
  setAdvancedFilterConfig: React.Dispatch<
    React.SetStateAction<Record<string, { filters: { id: string; value: string; operation: FilterOperation }[]; condition: "AND" | "OR" }>>
  >;
  setFullscreenMode: (mode: boolean) => void;
  resetAll: () => void;
  setShowShortcutsDialog: (show: boolean) => void;
}

/**
 * Keyboard shortcut handler for the table.
 * Bug fix: adds e.stopPropagation() on ALL handled events to prevent
 * table shortcuts from bubbling to parent components.
 * Bug fix: uses refs for isInputFocused to avoid stale closure.
 * Bug fix: uses searchInputRef instead of DOM query.
 */
export function useTableKeyboard({
  tableRef,
  searchInputRef,
  selectedCells,
  visibleColumns,
  processedData,
  fullscreenMode,
  selectionStart,
  selectionEnd,
  currentCell,
  selectedRows,
  selectedColumns,
  moveCurrentCell,
  extendSelection,
  selectAll,
  selectEntireRow,
  selectEntireColumn,
  setCurrentCell,
  setSelectedCells,
  setSelectionType,
  setSelectionStart,
  setSelectionEnd,
  resetSelection,
  handleSort,
  handleGroupChange,
  showColumnStats,
  copyToClipboard,
  exportToExcel,
  transposeSelectedRow,
  filterBySelection,
  setActiveFilterColumn,
  setAdvancedFilterConfig,
  setFullscreenMode,
  resetAll,
  setShowShortcutsDialog,
}: UseTableKeyboardArgs) {
  // Bug fix: use ref for isInputFocused to avoid stale closure in [] deps
  const isInputFocusedRef = useRef(false);

  const handleInputFocus = useCallback(() => {
    isInputFocusedRef.current = true;
  }, []);

  const handleInputBlur = useCallback(() => {
    isInputFocusedRef.current = false;
  }, []);

  // Listen to focus/blur on all inputs within the table
  useEffect(() => {
    const tableElement = tableRef.current;
    if (!tableElement) return;

    const onFocus = () => {
      isInputFocusedRef.current = true;
    };
    const onBlur = () => {
      isInputFocusedRef.current = false;
    };

    const inputs = tableElement.querySelectorAll("input, textarea");
    inputs.forEach((input) => {
      input.addEventListener("focus", onFocus);
      input.addEventListener("blur", onBlur);
    });

    return () => {
      inputs.forEach((input) => {
        input.removeEventListener("focus", onFocus);
        input.removeEventListener("blur", onBlur);
      });
    };
  });

  // Active filter focus
  useEffect(() => {
    // Re-observe when filter input ref changes
    if (searchInputRef.current) {
      // This is handled by the filter popover component itself
    }
  }, [searchInputRef]);

  useEffect(() => {
    const tableElement = tableRef.current;
    if (!tableElement) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !tableElement.contains(document.activeElement) ||
        isInputFocusedRef.current
      )
        return;

      let selectedCell: CellPosition | null = null;
      if (selectedCells.size === 1) {
        const key = Array.from(selectedCells)[0];
        selectedCell = parseCellKey(key);
      }

      const key = e.key;
      const noModifiers =
        !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (noModifiers) {
        switch (key) {
          case "a":
            e.preventDefault();
            e.stopPropagation();
            // Bug fix: use ref instead of DOM query
            searchInputRef.current?.focus();
            break;
          case "f":
            e.preventDefault();
            e.stopPropagation();
            if (selectedCell) setActiveFilterColumn(selectedCell.colName);
            break;
          case "s":
            e.preventDefault();
            e.stopPropagation();
            if (selectedCell) handleSort(selectedCell.colName);
            break;
          case "g":
            e.preventDefault();
            e.stopPropagation();
            if (selectedCell) handleGroupChange(selectedCell.colName);
            break;
          case "u":
            e.preventDefault();
            e.stopPropagation();
            if (selectedCell) showColumnStats(selectedCell.colName);
            break;
          case "c":
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard();
            break;
          case "x":
            e.preventDefault();
            e.stopPropagation();
            exportToExcel();
            break;
          case "h":
            e.preventDefault();
            e.stopPropagation();
            setShowShortcutsDialog(true);
            break;
          case "Tab":
            if (!e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              transposeSelectedRow();
            }
            break;
          case "Escape":
            e.preventDefault();
            e.stopPropagation();
            if (fullscreenMode) setFullscreenMode(false);
            else resetAll();
            break;
          case " ":
            if (
              selectedCells.size > 0 ||
              selectedRows.size > 0 ||
              selectedColumns.size > 0
            ) {
              e.preventDefault();
              e.stopPropagation();
              filterBySelection();
            }
            break;
          case ">":
          case "<":
            if (selectedCell) {
              e.preventDefault();
              e.stopPropagation();
              const operation =
                key === ">" ? "greaterThanOrEqual" : "lessThanOrEqual";
              const cellValue =
                processedData[selectedCell.rowIndex]?.[selectedCell.colName] ||
                "";
              setAdvancedFilterConfig((prev) => ({
                ...prev,
                [selectedCell.colName]: {
                  filters: [
                    {
                      id: Date.now().toString(),
                      value: cellValue,
                      operation,
                    },
                  ],
                  condition: "AND" as const,
                },
              }));
            }
            break;
        }
      }

      // Alt + comparison keys
      if (
        e.altKey &&
        (key === ">" || key === "." || key === "<" || key === ",")
      ) {
        if (selectedCell) {
          e.preventDefault();
          e.stopPropagation();
          const operation =
            key === ">" || key === "." ? "greaterThan" : "lessThan";
          const cellValue =
            processedData[selectedCell.rowIndex]?.[selectedCell.colName] || "";
          setAdvancedFilterConfig((prev) => ({
            ...prev,
            [selectedCell.colName]: {
              filters: [
                {
                  id: Date.now().toString(),
                  value: cellValue,
                  operation,
                },
              ],
              condition: "AND" as const,
            },
          }));
        }
      }

      // Arrow navigation
      if (
        !e.shiftKey &&
        !ctrlOrCmd &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedCell) {
          moveCurrentCell(
            key.replace("Arrow", "").toLowerCase() as
              | "up"
              | "down"
              | "left"
              | "right"
          );
        } else if (processedData.length > 0 && visibleColumns.length > 0) {
          const rowIndex = 0;
          const colName = visibleColumns[0];
          setCurrentCell({ rowIndex, colName });
          setSelectedCells(
            new Set([`${rowIndex}:${colName}`])
          );
          setSelectionType("cell");
          setSelectionStart({ rowIndex, colName });
          setSelectionEnd({ rowIndex, colName });
        }
      }

      // Shift+F for fullscreen
      if (e.shiftKey && key === "F") {
        e.preventDefault();
        e.stopPropagation();
        setFullscreenMode(!fullscreenMode);
      }

      // Ctrl+A to select all
      if (ctrlOrCmd && key === "a") {
        e.preventDefault();
        e.stopPropagation();
        selectAll();
      }

      // Ctrl+C to copy
      if (ctrlOrCmd && key === "c") {
        e.stopPropagation();
        copyToClipboard();
      }

      // Shift+Space for entire row
      if (e.shiftKey && key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (selectedCell) selectEntireRow(selectedCell.rowIndex);
      }

      // Ctrl+Space for entire column
      if (ctrlOrCmd && !e.shiftKey && key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (selectedCell) selectEntireColumn(selectedCell.colName);
      }

      // Shift+Arrow for extend selection
      if (
        e.shiftKey &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedCell && selectionStart) {
          extendSelection(
            key.replace("Arrow", "").toLowerCase() as
              | "up"
              | "down"
              | "left"
              | "right"
          );
        }
      }
    };

    tableElement.addEventListener("keydown", handleKeyDown);
    return () => {
      tableElement.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedCells,
    visibleColumns,
    fullscreenMode,
    processedData,
    selectionStart,
    selectionEnd,
    currentCell,
    selectedRows,
    selectedColumns,
    moveCurrentCell,
    extendSelection,
    selectAll,
    selectEntireRow,
    selectEntireColumn,
    setCurrentCell,
    setSelectedCells,
    setSelectionType,
    setSelectionStart,
    setSelectionEnd,
    resetSelection,
    handleSort,
    handleGroupChange,
    showColumnStats,
    copyToClipboard,
    exportToExcel,
    transposeSelectedRow,
    filterBySelection,
    setActiveFilterColumn,
    setAdvancedFilterConfig,
    setFullscreenMode,
    resetAll,
    setShowShortcutsDialog,
    searchInputRef,
    tableRef,
  ]);

  return {
    handleInputFocus,
    handleInputBlur,
  };
}
