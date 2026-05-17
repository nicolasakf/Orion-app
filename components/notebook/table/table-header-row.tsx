"use client";

import { useCallback } from "react";
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

import type { SortConfig, AdvancedFilterConfig, AdvancedFilter } from "./types";
import { MIN_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH } from "./constants";
import { FilterPopover } from "./filter-popover";

interface TableHeaderRowProps {
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

/** Renders the table header row with sort controls, filter popovers, and column resizing */
export function TableHeaderRow({
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
}: TableHeaderRowProps) {
  const handleDrop = useCallback(
    (header: string, e: React.DragEvent) => {
      e.preventDefault();
      const draggedHeader = e.dataTransfer.getData("text/plain");
      if (draggedHeader && draggedHeader !== header) {
        const newColumns = [...visibleColumns];
        const fromIndex = newColumns.indexOf(draggedHeader);
        const toIndex = newColumns.indexOf(header);
        if (fromIndex !== -1 && toIndex !== -1) {
          newColumns.splice(fromIndex, 1);
          newColumns.splice(toIndex, 0, draggedHeader);
          setVisibleColumns(newColumns);
        }
      }
    },
    [visibleColumns, setVisibleColumns]
  );

  return (
    <TableHeader className="border-x rounded-lg sticky">
      <TableRow>
        {visibleColumns.map((header, index) => (
          <TableHead
            key={header}
            className={cn(
              "whitespace-nowrap z-10 relative h-auto text-[9pt] px-1 py-1",
              index === 0 ? "pl-2.5" : "",
              freezeHeader ? "sticky top-0 bg-muted z-20" : "",
              selectedColumns.has(header) && "bg-primary/10",
              header === "Index" && "bg-muted"
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
            onContextMenu={(e) => {
              e.preventDefault();
              handleColumnSelect(header);
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => {
                  handleColumnSelect(header);
                  e.stopPropagation();
                }}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/plain", header)
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(header, e)}
              >
                {header}
              </div>
              <Button
                variant="blink"
                size="xs"
                onClick={() => handleSort(header)}
                onDoubleClick={() => handleColumnSelect(header)}
              >
                {sortConfig?.key === header ? (
                  sortConfig.direction === "asc" ? (
                    <ChevronUp className="h-4 w-4 text-blue-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-blue-500" />
                  )
                ) : (
                  <ChevronsUpDown className="h-4 w-4" />
                )}
              </Button>

              <FilterPopover
                header={header}
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
            </div>

            {/* Column resize handle */}
            <div
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth =
                  columnWidths[header] ||
                  e.currentTarget.parentElement?.getBoundingClientRect()
                    .width ||
                  DEFAULT_COLUMN_WIDTH;
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = Math.max(
                    MIN_COLUMN_WIDTH,
                    startWidth + moveEvent.clientX - startX
                  );
                  handleColumnResize(header, newWidth);
                };
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
            />
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}
