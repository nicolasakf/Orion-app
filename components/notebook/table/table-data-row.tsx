"use client";

import React, { useMemo } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface TableDataRowProps {
  row: Record<string, string>;
  rowIndex: number;
  visibleColumns: string[];
  isRowSelected: boolean;
  /** Pre-computed set of selected column names for this row */
  selectedColumnsForRow: Set<string>;
  columnWidths: Record<string, number>;
  fontSize: number;
  searchTerm: string;
  onCellMouseDown: (rowIndex: number, colName: string, e: React.MouseEvent) => void;
  onCellMouseEnter: (rowIndex: number, colName: string) => void;
  onCellMouseUp: () => void;
  onRowSelect: (rowIndex: number, e: React.MouseEvent) => void;
}

/**
 * Memoized table data row.
 * Bug fix: applies fontSize via inline style instead of hardcoded text-[10pt] class.
 */
function TableDataRowInner({
  row,
  rowIndex,
  visibleColumns,
  isRowSelected,
  selectedColumnsForRow,
  columnWidths,
  fontSize,
  searchTerm,
  onCellMouseDown,
  onCellMouseEnter,
  onCellMouseUp,
  onRowSelect,
}: TableDataRowProps) {
  return (
    <TableRow
      className={cn(
        isRowSelected && "bg-primary/10",
        "border-x-0"
      )}
      onDoubleClick={(e) => onRowSelect(rowIndex, e)}
    >
      {visibleColumns.map((header, index) => (
        <TableCell
          key={`${rowIndex}-${header}`}
          className={cn(
            "px-1 py-1 h-auto",
            index === 0 ? "pl-2.5" : "",
            selectedColumnsForRow.has(header) && "bg-primary/20",
            searchTerm &&
              String(row[header] || "")
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) &&
              "bg-yellow-100 dark:bg-yellow-900/30",
            "select-none",
            "border-x-0"
          )}
          style={{
            width: columnWidths[header]
              ? `${columnWidths[header]}px`
              : undefined,
            maxWidth: columnWidths[header]
              ? `${columnWidths[header]}px`
              : undefined,
            fontSize: `${fontSize}px`,
          }}
          onMouseDown={(e) => onCellMouseDown(rowIndex, header, e)}
          onMouseEnter={() => onCellMouseEnter(rowIndex, header)}
          onMouseUp={onCellMouseUp}
        >
          {row[header]}
        </TableCell>
      ))}
    </TableRow>
  );
}

/** Memoized row — only re-renders when its own data or selection changes */
export const TableDataRow = React.memo(TableDataRowInner, (prev, next) => {
  return (
    prev.row === next.row &&
    prev.rowIndex === next.rowIndex &&
    prev.isRowSelected === next.isRowSelected &&
    prev.selectedColumnsForRow === next.selectedColumnsForRow &&
    prev.visibleColumns === next.visibleColumns &&
    prev.columnWidths === next.columnWidths &&
    prev.fontSize === next.fontSize &&
    prev.searchTerm === next.searchTerm
  );
});
