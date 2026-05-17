"use client";

import React, { useMemo, useCallback } from "react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

import type { SortConfig, AdvancedFilterConfig, AdvancedFilter } from "./types";
import { TableHeaderRow } from "./table-header-row";
import { TableDataRow } from "./table-data-row";
import { parseCellKey } from "./utils";

interface TableContentProps {
  processedData: Record<string, string>[];
  visibleColumns: string[];
  setVisibleColumns: React.Dispatch<React.SetStateAction<string[]>>;
  sortConfig: SortConfig;
  handleSort: (key: string) => void;
  selectedColumns: Set<string>;
  handleColumnSelect: (colName: string, e?: React.MouseEvent) => void;
  columnWidths: Record<string, number>;
  handleColumnResize: (column: string, width: number) => void;
  freezeHeader: boolean;
  fontSize: number;
  selectedCells: Set<string>;
  selectedRows: Set<number>;
  searchTerm: string;
  handleCellMouseDown: (rowIndex: number, colName: string, e: React.MouseEvent) => void;
  handleCellMouseEnter: (rowIndex: number, colName: string) => void;
  handleCellMouseUp: () => void;
  handleRowSelect: (rowIndex: number, e: React.MouseEvent) => void;
  // Filter props
  activeFilterColumn: string | null;
  setActiveFilterColumn: (column: string | null) => void;
  hasColumnFilters: (column: string) => boolean;
  applyFilterToAllColumns: (column: string) => void;
  clearColumnFilters: (column: string) => void;
  pendingFilters: Record<string, AdvancedFilter[]>;
  setPendingFilters: React.Dispatch<
    React.SetStateAction<Record<string, AdvancedFilter[]>>
  >;
  pendingFilterLogic: Record<string, "AND" | "OR">;
  setPendingFilterLogic: React.Dispatch<
    React.SetStateAction<Record<string, "AND" | "OR">>
  >;
  applyPendingFilters: (column: string) => void;
  initPendingFilters: (column: string) => void;
  handleInputFocus: () => void;
  handleInputBlur: () => void;
  advancedFilterConfig: AdvancedFilterConfig;
}

/**
 * Table content component wrapping header + body in a single scroll container.
 * Bug fix: uses a single overflow:auto container so sticky header works correctly.
 */
export function TableContent({
  processedData,
  visibleColumns,
  setVisibleColumns,
  sortConfig,
  handleSort,
  selectedColumns,
  handleColumnSelect,
  columnWidths,
  handleColumnResize,
  freezeHeader,
  fontSize,
  selectedCells,
  selectedRows,
  searchTerm,
  handleCellMouseDown,
  handleCellMouseEnter,
  handleCellMouseUp,
  handleRowSelect,
  activeFilterColumn,
  setActiveFilterColumn,
  hasColumnFilters,
  applyFilterToAllColumns,
  clearColumnFilters,
  pendingFilters,
  setPendingFilters,
  pendingFilterLogic,
  setPendingFilterLogic,
  applyPendingFilters,
  initPendingFilters,
  handleInputFocus,
  handleInputBlur,
  advancedFilterConfig,
}: TableContentProps) {
  // Pre-compute per-row selection map for memoized rows
  const rowSelectionMap = useMemo(() => {
    const map = new Map<number, Set<string>>();
    selectedCells.forEach((key) => {
      const { rowIndex, colName } = parseCellKey(key);
      if (!map.has(rowIndex)) {
        map.set(rowIndex, new Set());
      }
      map.get(rowIndex)!.add(colName);
    });
    return map;
  }, [selectedCells]);

  const emptySet = useMemo(() => new Set<string>(), []);

  return (
    <Table className="border-x-0">
      <TableHeaderRow
        visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns}
        sortConfig={sortConfig}
        handleSort={handleSort}
        selectedColumns={selectedColumns}
        handleColumnSelect={handleColumnSelect}
        columnWidths={columnWidths}
        handleColumnResize={handleColumnResize}
        freezeHeader={freezeHeader}
        fontSize={fontSize}
        activeFilterColumn={activeFilterColumn}
        setActiveFilterColumn={setActiveFilterColumn}
        hasColumnFilters={hasColumnFilters}
        applyFilterToAllColumns={applyFilterToAllColumns}
        clearColumnFilters={clearColumnFilters}
        pendingFilters={pendingFilters}
        setPendingFilters={setPendingFilters}
        pendingFilterLogic={pendingFilterLogic}
        setPendingFilterLogic={setPendingFilterLogic}
        applyPendingFilters={applyPendingFilters}
        initPendingFilters={initPendingFilters}
        handleInputFocus={handleInputFocus}
        handleInputBlur={handleInputBlur}
        advancedFilterConfig={advancedFilterConfig}
      />
      <TableBody className="border-x-0">
        {processedData.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={visibleColumns.length}
              className="h-24 text-center"
            >
              No results found.
            </TableCell>
          </TableRow>
        ) : (
          processedData.map((row, rowIndex) => (
            <TableDataRow
              key={rowIndex}
              row={row}
              rowIndex={rowIndex}
              visibleColumns={visibleColumns}
              isRowSelected={selectedRows.has(rowIndex)}
              selectedColumnsForRow={rowSelectionMap.get(rowIndex) || emptySet}
              columnWidths={columnWidths}
              fontSize={fontSize}
              searchTerm={searchTerm}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseEnter={handleCellMouseEnter}
              onCellMouseUp={handleCellMouseUp}
              onRowSelect={handleRowSelect}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}
