/** Props for the DataTable component */
export interface DataTableProps {
  data: {
    headers: string[];
    rows: Record<string, string>[];
  };
}

/** Sort configuration for a column */
export type SortConfig = {
  key: string;
  direction: "asc" | "desc";
} | null;

/** Available filter operations */
export type FilterOperation =
  | "contains"
  | "doesNotContain"
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "blank"
  | "notBlank"
  | "regex"
  | "pandas";

/** Single filter entry with unique ID */
export type AdvancedFilter = {
  id: string;
  value: string;
  operation: FilterOperation;
};

/** Filters for a single column, combined with AND/OR logic */
export type ColumnFilter = {
  filters: AdvancedFilter[];
  condition: "AND" | "OR";
};

/** Advanced filter config keyed by column name */
export type AdvancedFilterConfig = {
  [key: string]: ColumnFilter;
};

/** Simple text filter config keyed by column name */
export type FilterConfig = {
  [key: string]: string;
};

/** Group-by column or null */
export type GroupConfig = string | null;

/** A saved table view capturing all display state */
export type TableView = {
  id: string;
  name: string;
  filterConfig: FilterConfig;
  advancedFilterConfig: AdvancedFilterConfig;
  sortConfig: SortConfig;
  searchTerm: string;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  freezeHeader: boolean;
  fontSize: number;
  rowHeight: number;
};

/** Position of a cell in the table */
export type CellPosition = {
  rowIndex: number;
  colName: string;
};

/** Current selection mode */
export type SelectionType = "none" | "cell" | "row" | "column" | "multiple";

/** Column statistics result */
export interface ColumnStats {
  count: number;
  numericCount: number;
  sum: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  uniqueValues: { value: string; count: number }[];
}

/** Selection state managed by use-table-selection */
export interface SelectionState {
  selectedCells: Set<string>;
  selectedRows: Set<number>;
  selectedColumns: Set<string>;
  selectionType: SelectionType;
  currentCell: CellPosition | null;
  selectionStart: CellPosition | null;
  selectionEnd: CellPosition | null;
  isSelecting: boolean;
}

/** Filter state managed by use-table-filters */
export interface FilterState {
  filterConfig: FilterConfig;
  advancedFilterConfig: AdvancedFilterConfig;
  activeFilterColumn: string | null;
  pendingFilters: Record<string, AdvancedFilter[]>;
  pendingFilterLogic: Record<string, "AND" | "OR">;
}

/** Display settings managed by use-display-settings */
export interface DisplaySettings {
  freezeHeader: boolean;
  fontSize: number;
  rowHeight: number;
  visibleRowCount: number;
  columnWidths: Record<string, number>;
  toolbarVisible: boolean;
}
