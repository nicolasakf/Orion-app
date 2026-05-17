"use client";

import { useState, useRef, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

import type { DataTableProps, FilterConfig } from "./types";
import { parseCellKey } from "./utils";
import {
  useDisplaySettings,
  useTableFilters,
  useTableSelection,
  useTableData,
  useTableKeyboard,
  useTableViews,
  useTableExport,
  useColumnStats,
} from "./hooks";
import { TableContent } from "./table-content";
import { Toolbar } from "./toolbar/toolbar";
import { StatsDialog } from "./dialogs/stats-dialog";
import { ShortcutsDialog } from "./dialogs/shortcuts-dialog";
import { ViewSaveDialog } from "./dialogs/view-save-dialog";
import { FullscreenDialog } from "./dialogs/fullscreen-dialog";

/** Main DataTable component — orchestrates hooks and sub-components */
export function DataTable({ data }: DataTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const tableContentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Display settings
  const displaySettings = useDisplaySettings();
  const {
    freezeHeader,
    setFreezeHeader,
    fontSize,
    setFontSize,
    rowHeight,
    setRowHeight,
    visibleRowCount,
    setVisibleRowCount,
    columnWidths,
    handleColumnResize,
    toolbarVisible,
    setToolbarVisible,
  } = displaySettings;

  // Columns
  const [visibleColumns, setVisibleColumns] = useState<string[]>(data.headers);

  // Sort
  const [sortConfig, setSortConfig] = useState<
    { key: string; direction: "asc" | "desc" } | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);

  // Filters
  const filters = useTableFilters(visibleColumns);

  // Data processing
  const tableData = useTableData({
    rows: data.rows,
    filterConfig: filters.filterConfig,
    advancedFilterConfig: filters.advancedFilterConfig,
    searchTerm,
    sortConfig,
  });
  const { processedData, originalData, setOriginalData, groupConfig, handleGroupChange } = tableData;

  // Selection
  const selection = useTableSelection(visibleColumns, processedData);

  // Export
  const { copyToClipboard, exportToExcel, exportToCSV } = useTableExport({
    processedData,
    visibleColumns,
    selectedCells: selection.selectedCells,
    selectedRows: selection.selectedRows,
    selectedColumns: selection.selectedColumns,
  });

  // Column stats
  const columnStatsHook = useColumnStats(processedData);

  // Sort handler
  const handleSort = useCallback(
    (key: string) => {
      setSortConfig((prev) => {
        if (prev && prev.key === key && prev.direction === "asc") {
          return { key, direction: "desc" };
        } else if (prev && prev.key === key && prev.direction === "desc") {
          return null;
        }
        return { key, direction: "asc" };
      });
    },
    []
  );

  // Search
  const handleSearch = useCallback((term: string) => setSearchTerm(term), []);

  // Column visibility
  const handleColumnVisibilityChange = useCallback(
    (column: string, isVisible: boolean) => {
      if (isVisible) setVisibleColumns((prev) => [...prev, column]);
      else setVisibleColumns((prev) => prev.filter((col) => col !== column));
    },
    []
  );

  // Transpose
  const transposeSelectedRow = useCallback(() => {
    let rowIndexToTranspose: number | null = null;
    if (selection.selectedCells.size === 1) {
      const key = Array.from(selection.selectedCells)[0];
      rowIndexToTranspose = parseCellKey(key).rowIndex;
    } else if (selection.selectedRows.size === 1) {
      rowIndexToTranspose = Array.from(selection.selectedRows)[0];
    }

    if (rowIndexToTranspose !== null) {
      const row = processedData[rowIndexToTranspose];
      if (!row) return;
      const transposedHeaders = ["Field", "Value"];
      const transposedRows = visibleColumns.map((header) => ({
        Field: header,
        Value: row[header] || "",
      }));
      setOriginalData(transposedRows);
      setVisibleColumns(transposedHeaders);
      selection.resetSelection();
      resetAll();
    }
  }, [
    selection.selectedCells,
    selection.selectedRows,
    processedData,
    visibleColumns,
    setOriginalData,
    selection.resetSelection,
  ]);

  // Filter by selection
  const filterBySelection = useCallback(() => {
    const newFilters: FilterConfig = { ...filters.filterConfig };
    const valuesByColumn: Record<string, Set<string>> = {};

    if (selection.selectedCells.size > 0) {
      selection.selectedCells.forEach((key) => {
        const { rowIndex, colName } = parseCellKey(key);
        const row = processedData[rowIndex];
        if (row) {
          if (!valuesByColumn[colName]) valuesByColumn[colName] = new Set();
          valuesByColumn[colName].add(row[colName]);
        }
      });
    } else if (selection.selectedColumns.size > 0 && selection.selectedRows.size > 0) {
      selection.selectedRows.forEach((rowIndex) => {
        const row = processedData[rowIndex];
        if (row) {
          selection.selectedColumns.forEach((colName) => {
            if (!valuesByColumn[colName]) valuesByColumn[colName] = new Set();
            valuesByColumn[colName].add(row[colName]);
          });
        }
      });
    }

    Object.entries(valuesByColumn).forEach(([colName, values]) => {
      newFilters[colName] = Array.from(values).join("|");
    });
    filters.setFilterConfig(newFilters);
  }, [
    filters.filterConfig,
    filters.setFilterConfig,
    selection.selectedCells,
    selection.selectedColumns,
    selection.selectedRows,
    processedData,
  ]);

  // Reset all
  const resetAll = useCallback(() => {
    filters.clearAllFilters();
    setSortConfig(null);
    setSearchTerm("");
    selection.resetSelection();
  }, [filters.clearAllFilters, selection.resetSelection]);

  // Views
  const viewsHook = useTableViews({
    filterConfig: filters.filterConfig,
    advancedFilterConfig: filters.advancedFilterConfig,
    sortConfig,
    searchTerm,
    visibleColumns,
    columnWidths,
    freezeHeader,
    fontSize,
    rowHeight,
    setFilterConfig: filters.setFilterConfig,
    setAdvancedFilterConfig: filters.setAdvancedFilterConfig,
    setSortConfig,
    setSearchTerm,
    setVisibleColumns,
    setColumnWidths: (widths: Record<string, number>) => {
      // Bulk set column widths
      Object.entries(widths).forEach(([col, w]) => handleColumnResize(col, w));
    },
    setFreezeHeader,
    setFontSize,
    setRowHeight,
    defaultHeaders: data.headers,
  });

  // Keyboard shortcuts
  const { handleInputFocus, handleInputBlur } = useTableKeyboard({
    tableRef,
    searchInputRef,
    selectedCells: selection.selectedCells,
    visibleColumns,
    processedData,
    fullscreenMode,
    selectionStart: selection.selectionStart,
    selectionEnd: selection.selectionEnd,
    currentCell: selection.currentCell,
    selectedRows: selection.selectedRows,
    selectedColumns: selection.selectedColumns,
    moveCurrentCell: selection.moveCurrentCell,
    extendSelection: selection.extendSelection,
    selectAll: selection.selectAll,
    selectEntireRow: selection.selectEntireRow,
    selectEntireColumn: selection.selectEntireColumn,
    setCurrentCell: selection.setCurrentCell,
    setSelectedCells: selection.setSelectedCells,
    setSelectionType: selection.setSelectionType,
    setSelectionStart: selection.setSelectionStart,
    setSelectionEnd: selection.setSelectionEnd,
    resetSelection: selection.resetSelection,
    handleSort,
    handleGroupChange,
    showColumnStats: columnStatsHook.showColumnStats,
    copyToClipboard,
    exportToExcel,
    transposeSelectedRow,
    filterBySelection,
    setActiveFilterColumn: filters.setActiveFilterColumn,
    setAdvancedFilterConfig: filters.setAdvancedFilterConfig,
    setFullscreenMode,
    resetAll,
    setShowShortcutsDialog,
  });

  // Shared table content props
  const tableContentProps = {
    processedData,
    visibleColumns,
    setVisibleColumns,
    sortConfig,
    handleSort,
    selectedColumns: selection.selectedColumns,
    handleColumnSelect: selection.handleColumnSelect,
    columnWidths,
    handleColumnResize,
    freezeHeader,
    fontSize,
    selectedCells: selection.selectedCells,
    selectedRows: selection.selectedRows,
    searchTerm,
    handleCellMouseDown: selection.handleCellMouseDown,
    handleCellMouseEnter: selection.handleCellMouseEnter,
    handleCellMouseUp: selection.handleCellMouseUp,
    handleRowSelect: selection.handleRowSelect,
    activeFilterColumn: filters.activeFilterColumn,
    setActiveFilterColumn: filters.setActiveFilterColumn,
    hasColumnFilters: filters.hasColumnFilters,
    applyFilterToAllColumns: filters.applyFilterToAllColumns,
    clearColumnFilters: filters.clearColumnFilters,
    pendingFilters: filters.pendingFilters,
    setPendingFilters: filters.setPendingFilters,
    pendingFilterLogic: filters.pendingFilterLogic,
    setPendingFilterLogic: filters.setPendingFilterLogic,
    applyPendingFilters: filters.applyPendingFilters,
    initPendingFilters: filters.initPendingFilters,
    handleInputFocus,
    handleInputBlur,
    advancedFilterConfig: filters.advancedFilterConfig,
  };

  const calculateTableHeight = () => visibleRowCount * rowHeight;

  return (
    <TooltipProvider>
      <div className="space-y-2" ref={tableRef} tabIndex={0}>
        <div className="col-span-12">
          <div className="space-y-2 p-2">
            {toolbarVisible && (
              <Toolbar
                searchTerm={searchTerm}
                handleSearch={handleSearch}
                searchInputRef={searchInputRef}
                handleInputFocus={handleInputFocus}
                handleInputBlur={handleInputBlur}
                setFullscreenMode={setFullscreenMode}
                resetAll={resetAll}
                data={data}
                visibleColumns={visibleColumns}
                setVisibleColumns={setVisibleColumns}
                handleColumnSelect={selection.handleColumnSelect}
                handleColumnVisibilityChange={handleColumnVisibilityChange}
                copyToClipboard={copyToClipboard}
                exportToExcel={exportToExcel}
                isViewDialogOpen={viewsHook.isViewDialogOpen}
                setIsViewDialogOpen={viewsHook.setIsViewDialogOpen}
                freezeHeader={freezeHeader}
                setFreezeHeader={setFreezeHeader}
                toolbarVisible={toolbarVisible}
                setToolbarVisible={setToolbarVisible}
                visibleRowCount={visibleRowCount}
                setVisibleRowCount={setVisibleRowCount}
                rowHeight={rowHeight}
                setRowHeight={setRowHeight}
                fontSize={fontSize}
                setFontSize={setFontSize}
                views={viewsHook.views}
                activeView={viewsHook.activeView}
                applyView={viewsHook.applyView}
                resetToDefault={viewsHook.resetToDefault}
                deleteView={viewsHook.deleteView}
                setShowShortcutsDialog={setShowShortcutsDialog}
              />
            )}

            <StatsDialog
              open={columnStatsHook.showStatsDialog}
              onOpenChange={columnStatsHook.setShowStatsDialog}
              statsColumn={columnStatsHook.statsColumn}
              columnStats={columnStatsHook.columnStats}
            />

            {!fullscreenMode && (
              <div className="border-y border-x-0 overflow-hidden">
                <div
                  ref={tableContentRef}
                  className="overflow-auto"
                  style={{
                    maxHeight: `${calculateTableHeight()}px`,
                    fontSize: `${fontSize}px`,
                  }}
                >
                  <TableContent {...tableContentProps} />
                </div>
              </div>
            )}
          </div>
        </div>

        <ShortcutsDialog
          open={showShortcutsDialog}
          onOpenChange={setShowShortcutsDialog}
        />
        <ViewSaveDialog
          open={viewsHook.isViewDialogOpen}
          onOpenChange={viewsHook.setIsViewDialogOpen}
          newViewName={viewsHook.newViewName}
          setNewViewName={viewsHook.setNewViewName}
          saveCurrentView={viewsHook.saveCurrentView}
          handleInputFocus={handleInputFocus}
          handleInputBlur={handleInputBlur}
        />
        <FullscreenDialog
          open={fullscreenMode}
          onOpenChange={setFullscreenMode}
          fontSize={fontSize}
        >
          <TableContent {...tableContentProps} />
        </FullscreenDialog>
      </div>
    </TooltipProvider>
  );
}
