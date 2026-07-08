"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Clipboard,
  Columns3,
  Download,
  Eye,
  EyeOff,
  Filter,
  HelpCircle,
  Info,
  Maximize2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NotebookAppViewSchemaNode } from "@/lib/notebook/app-view";
import { cn } from "@/lib/utils";
import {
  OrionTableExportSchema,
  OrionTableStatsSchema,
  OrionTableWindowSchema,
  type OrionTableColumn,
  type OrionTableCommResponse,
  type OrionTableFilter,
  type OrionTableFilterOperation,
  type OrionTableMode,
  type OrionTableOutputMetadata,
  type OrionTableRequest,
  type OrionTableRow,
  type OrionTableSavedView,
  type OrionTableState,
  type OrionTableStats,
  type OrionTableWindow,
} from "./types";

interface OrionUiTableProps {
  node: NotebookAppViewSchemaNode;
  requestTableData?: (
    request: OrionTableRequest,
  ) => Promise<OrionTableCommResponse>;
  tableMetadata?: OrionTableOutputMetadata | null;
  onTableMetadataChange?: (metadata: OrionTableOutputMetadata) => void;
}

interface TableProps {
  tableId: string;
  source: string;
  title?: string;
  mode: OrionTableMode;
  pageSize: number;
  initialWindow: OrionTableWindow;
}

interface SelectionAnchor {
  rowNumber: number;
  columnKey: string;
}

interface DisplaySettings {
  mode: OrionTableMode;
  pageSize: number;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  freezeHeader: boolean;
  fontSize: number;
  rowHeight: number;
}

const DEFAULT_ROW_HEIGHT = 36;
const DEFAULT_FONT_SIZE = 13;
const MIN_COLUMN_WIDTH = 64;
const DEFAULT_COLUMN_WIDTH = 150;
const SEARCH_COLLAPSE_WIDTH = 560;
const FOOTER_COMPACT_WIDTH = 620;
const FILTER_OPERATIONS: Array<{
  value: OrionTableFilterOperation;
  label: string;
}> = [
  { value: "contains", label: "Contains" },
  { value: "doesNotContain", label: "Does not contain" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Not equals" },
  { value: "greaterThan", label: "Greater than" },
  { value: "greaterThanOrEqual", label: "Greater/equal" },
  { value: "lessThan", label: "Less than" },
  { value: "lessThanOrEqual", label: "Less/equal" },
  { value: "blank", label: "Blank" },
  { value: "notBlank", label: "Not blank" },
  { value: "regex", label: "Regex" },
];

const emptyMetadata: OrionTableOutputMetadata = {
  version: 1,
  activeViewId: null,
  views: [],
};

/** Parse a Table primitive node into strongly typed renderer props. */
function parseTableProps(node: NotebookAppViewSchemaNode): {
  status: "valid";
  props: TableProps;
} | {
  status: "invalid";
  errors: string[];
} {
  const errors: string[] = [];
  const tableId = stringProp(node.props, "tableId");
  const source = stringProp(node.props, "source");
  const mode = stringProp(node.props, "mode") === "virtual" ? "virtual" : "paginated";
  const pageSize = finiteNumberProp(node.props, "pageSize") ?? 50;
  const title = stringProp(node.props, "title");
  const parsedWindow = OrionTableWindowSchema.safeParse(node.props.initialWindow);

  if (!tableId) errors.push("Table props.tableId must be a string.");
  if (!source) errors.push("Table props.source must be a string.");
  if (!parsedWindow.success) {
    errors.push("Table props.initialWindow is invalid.");
  }

  if (errors.length > 0 || !tableId || !source || !parsedWindow.success) {
    return { status: "invalid", errors };
  }

  return {
    status: "valid",
    props: {
      tableId,
      source,
      title,
      mode,
      pageSize: Math.max(1, Math.min(Math.floor(pageSize), 500)),
      initialWindow: parsedWindow.data,
    },
  };
}

/** Read a string prop from a primitive node. */
function stringProp(
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = props[key];
  return typeof value === "string" ? value : undefined;
}

/** Read a finite numeric prop from a primitive node. */
function finiteNumberProp(
  props: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Return display text for a table cell value. */
function formatCell(value: OrionTableRow[string]): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Build a stable key for one selected table cell. */
function cellKey(rowNumber: number, columnKey: string): string {
  return `${rowNumber}:${columnKey}`;
}

/** Parse a cell key generated by cellKey(). */
function parseCellKey(key: string): SelectionAnchor {
  const separatorIndex = key.indexOf(":");
  return {
    rowNumber: Number.parseInt(key.slice(0, separatorIndex), 10),
    columnKey: key.slice(separatorIndex + 1),
  };
}

/** Return the backend row number for a serialized row. */
function rowNumber(row: OrionTableRow, fallback: number): number {
  const value = row.__rowNumber;
  return typeof value === "number" ? value : fallback;
}

/** Create default display settings from the initial backend window. */
function defaultDisplaySettings(
  initialWindow: OrionTableWindow,
  mode: OrionTableMode,
  pageSize: number,
): DisplaySettings {
  return {
    mode,
    pageSize,
    visibleColumns: initialWindow.columns.map((column) => column.key),
    columnWidths: {},
    freezeHeader: true,
    fontSize: DEFAULT_FONT_SIZE,
    rowHeight: DEFAULT_ROW_HEIGHT,
  };
}

/** Return the neutral operation state used by the implicit Default view. */
function defaultTableState(): OrionTableState {
  return {
    search: "",
    sort: null,
    filters: [],
    groupBy: null,
  };
}

/** Copy display settings into the serializable saved-view shape. */
function savedDisplaySettings(display: DisplaySettings): OrionTableSavedView["display"] {
  return {
    mode: display.mode,
    pageSize: display.pageSize,
    visibleColumns: [...display.visibleColumns],
    columnWidths: { ...display.columnWidths },
    freezeHeader: display.freezeHeader,
    fontSize: display.fontSize,
    rowHeight: display.rowHeight,
  };
}

/** Trigger a browser download for a generated CSV export. */
function downloadTextFile(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Render an Orion UI backend-backed DataFrame table. */
export function OrionUiTable({
  node,
  requestTableData,
  tableMetadata,
  onTableMetadataChange,
}: OrionUiTableProps): React.JSX.Element {
  const parsed = parseTableProps(node);

  if (parsed.status === "invalid") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <div className="font-medium">Orion table could not be rendered</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {parsed.errors.map((error, index) => (
            <li key={`${error}-${index}`}>{error}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <OrionUiTableInner
      {...parsed.props}
      className={stringProp(node.props, "className")}
      requestTableData={requestTableData}
      tableMetadata={tableMetadata ?? emptyMetadata}
      onTableMetadataChange={onTableMetadataChange}
    />
  );
}

interface OrionUiTableInnerProps extends TableProps {
  className?: string;
  requestTableData?: (
    request: OrionTableRequest,
  ) => Promise<OrionTableCommResponse>;
  tableMetadata: OrionTableOutputMetadata;
  onTableMetadataChange?: (metadata: OrionTableOutputMetadata) => void;
}

/** Stateful table implementation split from schema validation for readability. */
function OrionUiTableInner({
  tableId,
  source,
  title,
  mode,
  pageSize,
  initialWindow,
  className,
  requestTableData,
  tableMetadata,
  onTableMetadataChange,
}: OrionUiTableInnerProps): React.JSX.Element {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [windowData, setWindowData] = useState<OrionTableWindow>(initialWindow);
  const [tableState, setTableState] = useState<OrionTableState>(() =>
    defaultTableState(),
  );
  const [display, setDisplay] = useState<DisplaySettings>(() =>
    defaultDisplaySettings(initialWindow, mode, pageSize),
  );
  const [offset, setOffset] = useState(initialWindow.offset);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<{
    operation: OrionTableFilterOperation;
    value: string;
  }>({ operation: "contains", value: "" });
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<OrionTableStats | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(
    tableMetadata.activeViewId ?? null,
  );
  const views = tableMetadata.views ?? [];
  const visibleColumns = useMemo(
    () =>
      windowData.columns.filter((column) =>
        display.visibleColumns.includes(column.key),
      ),
    [display.visibleColumns, windowData.columns],
  );

  const currentPage = Math.floor(offset / display.pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(windowData.totalRows / display.pageSize));
  const windowSignature = JSON.stringify(initialWindow);

  useEffect(() => {
    setWindowData(initialWindow);
    setOffset(initialWindow.offset);
    setDisplay(defaultDisplaySettings(initialWindow, mode, pageSize));
    setTableState(defaultTableState());
    setSelectedCells(new Set());
    setSelectedRows(new Set());
    setSelectedColumns(new Set());
    setSelectionAnchor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, windowSignature, mode, pageSize]);

  /** Writes changed operations/display back to the currently active saved view. */
  const updateSavedView = useCallback(
    (
      viewId: string,
      operations: OrionTableState,
      nextDisplay: DisplaySettings,
      expression?: string,
    ) => {
      const hasView = views.some((view) => view.id === viewId);
      if (!hasView) return;

      onTableMetadataChange?.({
        version: 1,
        activeViewId: viewId,
        views: views.map((view) =>
          view.id === viewId
            ? {
                ...view,
                operations,
                expression: expression ?? view.expression,
                display: savedDisplaySettings(nextDisplay),
              }
            : view,
        ),
      });
    },
    [onTableMetadataChange, views],
  );

  /** Fetches a bounded backend window for the current operation state. */
  const fetchWindow = useCallback(
    async (
      nextOffset: number,
      nextState = tableState,
      nextDisplay = display,
      persistViewId: string | null = null,
    ) => {
      if (!requestTableData) {
        setError("Live table actions require an active Orion kernel.");
        return;
      }

      setPending(true);
      setError(null);
      try {
        const response = await requestTableData({
          action: "fetch",
          tableId,
          state: nextState,
          offset: nextOffset,
          limit: nextDisplay.pageSize,
        });
        const parsedResponse = OrionTableWindowSchema.safeParse(response);
        if (!parsedResponse.success) {
          throw new Error("Kernel returned an invalid table window.");
        }
        setWindowData(parsedResponse.data);
        setOffset(parsedResponse.data.offset);
        if (persistViewId) {
          updateSavedView(
            persistViewId,
            nextState,
            nextDisplay,
            parsedResponse.data.expression,
          );
        }
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch table data.",
        );
      } finally {
        setPending(false);
      }
    },
    [display, requestTableData, tableId, tableState, updateSavedView],
  );

  /** Applies a state update and refreshes the backend window from the first row. */
  const applyState = useCallback(
    (updater: (current: OrionTableState) => OrionTableState) => {
      setTableState((current) => {
        const nextState = updater(current);
        if (activeViewId) {
          updateSavedView(activeViewId, nextState, display);
        }
        void fetchWindow(0, nextState, display, activeViewId);
        return nextState;
      });
      setSelectedCells(new Set());
      setSelectedRows(new Set());
      setSelectedColumns(new Set());
      setSelectionAnchor(null);
    },
    [activeViewId, display, fetchWindow, updateSavedView],
  );

  /** Updates display settings and refreshes the backend when page size changes. */
  const updateDisplay = useCallback(
    (updater: (current: DisplaySettings) => DisplaySettings) => {
      setDisplay((current) => {
        const next = updater(current);
        if (activeViewId) {
          updateSavedView(activeViewId, tableState, next);
        }
        if (next.pageSize !== current.pageSize) {
          void fetchWindow(0, tableState, next, activeViewId);
        }
        return next;
      });
    },
    [activeViewId, fetchWindow, tableState, updateSavedView],
  );

  /** Toggles a column's visibility without changing backend state. */
  const setColumnVisible = useCallback(
    (columnKey: string, visible: boolean) => {
      setDisplay((current) => {
        const next = {
          ...current,
          visibleColumns: visible
            ? Array.from(new Set([...current.visibleColumns, columnKey]))
            : current.visibleColumns.filter((key) => key !== columnKey),
        };
        if (activeViewId) {
          updateSavedView(activeViewId, tableState, next);
        }
        return next;
      });
    },
    [activeViewId, tableState, updateSavedView],
  );

  /** Cycles sorting for one column and delegates sorting to pandas. */
  const handleSort = useCallback(
    (columnKey: string) => {
      if (columnKey === "__index__") return;
      applyState((current) => {
        const currentSort = current.sort;
        if (!currentSort || currentSort.column !== columnKey) {
          return { ...current, sort: { column: columnKey, direction: "asc" } };
        }
        if (currentSort.direction === "asc") {
          return { ...current, sort: { column: columnKey, direction: "desc" } };
        }
        return { ...current, sort: null };
      });
    },
    [applyState],
  );

  /** Applies the current filter popover draft to a column. */
  const applyColumnFilter = useCallback(
    (columnKey: string) => {
      applyState((current) => ({
        ...current,
        filters: [
          ...current.filters.filter((filter) => filter.column !== columnKey),
          {
            column: columnKey,
            operation: filterDraft.operation,
            value: filterDraft.value,
          },
        ],
      }));
      setActiveFilterColumn(null);
    },
    [applyState, filterDraft],
  );

  /** Clears all filters for one column. */
  const clearColumnFilter = useCallback(
    (columnKey: string) => {
      applyState((current) => ({
        ...current,
        filters: current.filters.filter((filter) => filter.column !== columnKey),
      }));
    },
    [applyState],
  );

  /** Opens or closes the anchored filter popup for one column. */
  const setColumnFilterOpen = useCallback(
    (columnKey: string, open: boolean) => {
      if (!open) {
        setActiveFilterColumn((current) =>
          current === columnKey ? null : current,
        );
        return;
      }

      const existing = tableState.filters.find(
        (filter) => filter.column === columnKey,
      );
      setFilterDraft({
        operation: existing?.operation ?? "contains",
        value: existing?.value ?? "",
      });
      setActiveFilterColumn(columnKey);
    },
    [tableState.filters],
  );

  /** Selects one cell or toggles it with Cmd/Ctrl. */
  const selectCell = useCallback(
    (row: OrionTableRow, columnKey: string, event?: React.MouseEvent) => {
      const nextAnchor = { rowNumber: rowNumber(row, offset), columnKey };
      const key = cellKey(nextAnchor.rowNumber, columnKey);
      setSelectionAnchor(nextAnchor);
      setSelectedRows(new Set());
      setSelectedColumns(new Set());
      setSelectedCells((current) => {
        if (event?.metaKey || event?.ctrlKey) {
          const next = new Set(current);
          next.has(key) ? next.delete(key) : next.add(key);
          return next;
        }
        return new Set([key]);
      });
    },
    [offset],
  );

  /** Selects all currently materialized cells. */
  const selectAllVisible = useCallback(() => {
    const next = new Set<string>();
    for (const row of windowData.rows) {
      const absoluteRow = rowNumber(row, offset);
      for (const column of visibleColumns) {
        next.add(cellKey(absoluteRow, column.key));
      }
    }
    setSelectedCells(next);
    setSelectedRows(new Set());
    setSelectedColumns(new Set());
  }, [offset, visibleColumns, windowData.rows]);

  /** Moves the keyboard selection, fetching adjacent pages when needed. */
  const moveSelection = useCallback(
    (direction: "up" | "down" | "left" | "right", extend: boolean) => {
      const anchor = selectionAnchor ?? {
        rowNumber: rowNumber(windowData.rows[0] ?? {}, offset),
        columnKey: visibleColumns[0]?.key ?? "",
      };
      if (!anchor.columnKey) return;

      const columnIndex = Math.max(
        0,
        visibleColumns.findIndex((column) => column.key === anchor.columnKey),
      );
      let nextRow = anchor.rowNumber;
      let nextColumn = anchor.columnKey;
      if (direction === "up") nextRow = Math.max(0, nextRow - 1);
      if (direction === "down") {
        nextRow = Math.min(Math.max(0, windowData.totalRows - 1), nextRow + 1);
      }
      if (direction === "left" && columnIndex > 0) {
        nextColumn = visibleColumns[columnIndex - 1]!.key;
      }
      if (direction === "right" && columnIndex < visibleColumns.length - 1) {
        nextColumn = visibleColumns[columnIndex + 1]!.key;
      }

      const targetOffset =
        nextRow < offset || nextRow >= offset + display.pageSize
          ? Math.floor(nextRow / display.pageSize) * display.pageSize
          : offset;
      if (targetOffset !== offset) {
        void fetchWindow(targetOffset);
      }

      const nextAnchor = { rowNumber: nextRow, columnKey: nextColumn };
      setSelectionAnchor(nextAnchor);
      setSelectedCells((current) => {
        if (extend && selectionAnchor) {
          const next = new Set(current);
          next.add(cellKey(nextRow, nextColumn));
          return next;
        }
        return new Set([cellKey(nextRow, nextColumn)]);
      });
    },
    [
      display.pageSize,
      fetchWindow,
      offset,
      selectionAnchor,
      visibleColumns,
      windowData.rows,
      windowData.totalRows,
    ],
  );

  /** Copies selected cells or the backend current view to the clipboard. */
  const copyToClipboard = useCallback(async () => {
    if (selectedCells.size > 0) {
      const rowsByNumber = new Map<number, OrionTableRow>();
      windowData.rows.forEach((row) => rowsByNumber.set(rowNumber(row, offset), row));
      const selected = Array.from(selectedCells).map(parseCellKey);
      const selectedColumnKeys = visibleColumns
        .map((column) => column.key)
        .filter((columnKey) =>
          selected.some((cell) => cell.columnKey === columnKey),
        );
      const selectedRowsByNumber = new Map<number, SelectionAnchor[]>();
      selected.forEach((cell) => {
        selectedRowsByNumber.set(cell.rowNumber, [
          ...(selectedRowsByNumber.get(cell.rowNumber) ?? []),
          cell,
        ]);
      });
      const lines = [
        selectedColumnKeys
          .map((columnKey) => visibleColumns.find((column) => column.key === columnKey)?.label ?? columnKey)
          .join("\t"),
        ...Array.from(selectedRowsByNumber.keys())
          .sort((left, right) => left - right)
          .map((selectedRowNumber) => {
            const row = rowsByNumber.get(selectedRowNumber);
            return selectedColumnKeys.map((columnKey) => formatCell(row?.[columnKey] ?? "")).join("\t");
          }),
      ];
      await navigator.clipboard.writeText(lines.join("\n"));
      return;
    }

    if (!requestTableData) {
      setError("Live table actions require an active Orion kernel.");
      return;
    }
    const response = await requestTableData({
      action: "export_csv",
      tableId,
      state: tableState,
      columns: visibleColumns
        .map((column) => column.key)
        .filter((key) => key !== "__index__"),
    });
    const parsedResponse = OrionTableExportSchema.safeParse(response);
    if (!parsedResponse.success) {
      setError("Kernel returned an invalid export payload.");
      return;
    }
    await navigator.clipboard.writeText(parsedResponse.data.csv);
  }, [
    offset,
    requestTableData,
    selectedCells,
    tableId,
    tableState,
    visibleColumns,
    windowData.rows,
  ]);

  /** Downloads the current backend view as CSV. */
  const exportCsv = useCallback(async () => {
    if (!requestTableData) {
      setError("Live table actions require an active Orion kernel.");
      return;
    }
    const response = await requestTableData({
      action: "export_csv",
      tableId,
      state: tableState,
      columns: visibleColumns
        .map((column) => column.key)
        .filter((key) => key !== "__index__"),
    });
    const parsedResponse = OrionTableExportSchema.safeParse(response);
    if (!parsedResponse.success) {
      setError("Kernel returned an invalid export payload.");
      return;
    }
    downloadTextFile(`${source.replace(/\W+/g, "_") || "orion-table"}.csv`, parsedResponse.data.csv, "text/csv;charset=utf-8");
  }, [requestTableData, source, tableId, tableState, visibleColumns]);

  /** Opens backend column stats in the stats dialog. */
  const showColumnStats = useCallback(
    async (columnKey: string) => {
      if (columnKey === "__index__" || !requestTableData) return;
      setError(null);
      const response = await requestTableData({
        action: "stats",
        tableId,
        state: tableState,
        column: columnKey,
      });
      const parsedResponse = OrionTableStatsSchema.safeParse(response);
      if (!parsedResponse.success) {
        setError("Kernel returned invalid column statistics.");
        return;
      }
      setStats(parsedResponse.data);
      setStatsOpen(true);
    },
    [requestTableData, tableId, tableState],
  );

  /** Persists the current table state as output-level Orion metadata. */
  const saveCurrentView = useCallback(async () => {
    const name = newViewName.trim();
    if (!name) return;
    let expression = windowData.expression ?? source;
    if (requestTableData) {
      try {
        const response = await requestTableData({
          action: "expression",
          tableId,
          state: tableState,
        });
        if ("expression" in response && typeof response.expression === "string") {
          expression = response.expression;
        }
      } catch {
        // The latest window expression is still useful metadata.
      }
    }

    const view: OrionTableSavedView = {
      id: `view-${Date.now()}`,
      name,
      operations: tableState,
      expression,
      display: {
        mode: display.mode,
        pageSize: display.pageSize,
        visibleColumns: display.visibleColumns,
        columnWidths: display.columnWidths,
        freezeHeader: display.freezeHeader,
        fontSize: display.fontSize,
        rowHeight: display.rowHeight,
      },
    };
    const nextMetadata: OrionTableOutputMetadata = {
      version: 1,
      activeViewId: view.id,
      views: [...views, view],
    };
    onTableMetadataChange?.(nextMetadata);
    setActiveViewId(view.id);
    setNewViewName("");
    setSaveViewOpen(false);
  }, [
    display,
    newViewName,
    onTableMetadataChange,
    requestTableData,
    source,
    tableId,
    tableState,
    views,
    windowData.expression,
  ]);

  /** Applies one saved metadata view and refreshes the backend window. */
  const applyView = useCallback(
    (view: OrionTableSavedView | null) => {
      if (!view) {
        const nextDisplay = defaultDisplaySettings(initialWindow, mode, pageSize);
        const nextState = defaultTableState();
        setDisplay(nextDisplay);
        setTableState(nextState);
        setActiveViewId(null);
        void fetchWindow(0, nextState, nextDisplay);
        onTableMetadataChange?.({ ...tableMetadata, activeViewId: null });
        return;
      }
      setDisplay(view.display);
      setTableState(view.operations);
      setActiveViewId(view.id);
      void fetchWindow(0, view.operations, view.display);
      onTableMetadataChange?.({ ...tableMetadata, activeViewId: view.id });
    },
    [
      fetchWindow,
      initialWindow,
      mode,
      onTableMetadataChange,
      pageSize,
      tableMetadata,
    ],
  );

  /** Resets the active view in place, or resets to Default when no view is active. */
  const resetTable = useCallback(() => {
    const nextDisplay = defaultDisplaySettings(initialWindow, mode, pageSize);
    const nextState = defaultTableState();

    setDisplay(nextDisplay);
    setTableState(nextState);
    setSelectedCells(new Set());
    setSelectedRows(new Set());
    setSelectedColumns(new Set());
    setSelectionAnchor(null);

    if (activeViewId) {
      updateSavedView(activeViewId, nextState, nextDisplay);
      void fetchWindow(0, nextState, nextDisplay, activeViewId);
      return;
    }

    setActiveViewId(null);
    void fetchWindow(0, nextState, nextDisplay);
    onTableMetadataChange?.({ ...tableMetadata, activeViewId: null });
  }, [
    activeViewId,
    fetchWindow,
    initialWindow,
    mode,
    onTableMetadataChange,
    pageSize,
    tableMetadata,
    updateSavedView,
  ]);

  /** Deletes a saved metadata view from the output. */
  const deleteView = useCallback(
    (viewId: string) => {
      const nextViews = views.filter((view) => view.id !== viewId);
      const nextActiveViewId = activeViewId === viewId ? null : activeViewId;
      onTableMetadataChange?.({
        version: 1,
        activeViewId: nextActiveViewId,
        views: nextViews,
      });
      if (activeViewId === viewId) {
        setActiveViewId(null);
      }
    },
    [activeViewId, onTableMetadataChange, views],
  );

  /** Handles table-scoped keyboard shortcuts from the previous table UX. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      const key = event.key;
      const ctrlOrCmd = event.ctrlKey || event.metaKey;
      const anchor = selectionAnchor;
      const selectedColumn =
        anchor?.columnKey && anchor.columnKey !== "__index__"
          ? anchor.columnKey
          : visibleColumns.find((column) => column.key !== "__index__")?.key;

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
        moveSelection(
          key.replace("Arrow", "").toLowerCase() as
            | "up"
            | "down"
            | "left"
            | "right",
          event.shiftKey,
        );
        return;
      }
      if (ctrlOrCmd && key.toLowerCase() === "a") {
        event.preventDefault();
        event.stopPropagation();
        selectAllVisible();
        return;
      }
      if (ctrlOrCmd && key.toLowerCase() === "c") {
        event.stopPropagation();
        void copyToClipboard();
        return;
      }
      if (event.shiftKey && key === " ") {
        event.preventDefault();
        event.stopPropagation();
        if (anchor) {
          setSelectedRows(new Set([anchor.rowNumber]));
          setSelectedCells(new Set());
          setSelectedColumns(new Set());
        }
        return;
      }
      if (ctrlOrCmd && key === " ") {
        event.preventDefault();
        event.stopPropagation();
        if (selectedColumn) {
          setSelectedColumns(new Set([selectedColumn]));
          setSelectedCells(new Set());
          setSelectedRows(new Set());
        }
        return;
      }
      if (!event.shiftKey && !event.altKey && !ctrlOrCmd) {
        if (key.toLowerCase() === "a") {
          event.preventDefault();
          searchInputRef.current?.focus();
        } else if (key.toLowerCase() === "f" && selectedColumn) {
          event.preventDefault();
          setActiveFilterColumn(selectedColumn);
        } else if (key.toLowerCase() === "s" && selectedColumn) {
          event.preventDefault();
          handleSort(selectedColumn);
        } else if (key.toLowerCase() === "g" && selectedColumn) {
          event.preventDefault();
          applyState((current) => ({
            ...current,
            groupBy: current.groupBy === selectedColumn ? null : selectedColumn,
          }));
        } else if (key.toLowerCase() === "u" && selectedColumn) {
          event.preventDefault();
          void showColumnStats(selectedColumn);
        } else if (key.toLowerCase() === "h") {
          event.preventDefault();
          setShortcutsOpen(true);
        } else if (key.toLowerCase() === "c") {
          event.preventDefault();
          void copyToClipboard();
        } else if (key.toLowerCase() === "x") {
          event.preventDefault();
          void exportCsv();
        } else if (key === "Escape") {
          event.preventDefault();
          if (fullscreenOpen) setFullscreenOpen(false);
          else {
            setSelectedCells(new Set());
            setSelectedRows(new Set());
            setSelectedColumns(new Set());
            setSelectionAnchor(null);
          }
        } else if ((key === ">" || key === "<") && selectedColumn && anchor) {
          event.preventDefault();
          const row = windowData.rows.find(
            (candidate) => rowNumber(candidate, offset) === anchor.rowNumber,
          );
          const value = formatCell(row?.[selectedColumn] ?? "");
          applyState((current) => ({
            ...current,
            filters: [
              ...current.filters.filter((filter) => filter.column !== selectedColumn),
              {
                column: selectedColumn,
                operation: key === ">" ? "greaterThanOrEqual" : "lessThanOrEqual",
                value,
              },
            ],
          }));
        } else if (key === " " && selectedCells.size > 0) {
          event.preventDefault();
          const first = parseCellKey(Array.from(selectedCells)[0]!);
          const row = windowData.rows.find(
            (candidate) => rowNumber(candidate, offset) === first.rowNumber,
          );
          const value = formatCell(row?.[first.columnKey] ?? "");
          applyState((current) => ({
            ...current,
            filters: [
              ...current.filters.filter((filter) => filter.column !== first.columnKey),
              { column: first.columnKey, operation: "equals", value },
            ],
          }));
        }
      }
      if (event.shiftKey && key.toLowerCase() === "f") {
        event.preventDefault();
        setFullscreenOpen((current) => !current);
      }
      if (
        event.altKey &&
        (key === ">" || key === "." || key === "<" || key === ",") &&
        selectedColumn &&
        anchor
      ) {
        event.preventDefault();
        const row = windowData.rows.find(
          (candidate) => rowNumber(candidate, offset) === anchor.rowNumber,
        );
        const value = formatCell(row?.[selectedColumn] ?? "");
        applyState((current) => ({
          ...current,
          filters: [
            ...current.filters.filter((filter) => filter.column !== selectedColumn),
            {
              column: selectedColumn,
              operation: key === ">" || key === "." ? "greaterThan" : "lessThan",
              value,
            },
          ],
        }));
      }
      if (key === "Tab" && !event.shiftKey && anchor) {
        event.preventDefault();
        const row = windowData.rows.find(
          (candidate) => rowNumber(candidate, offset) === anchor.rowNumber,
        );
        if (row) {
          setWindowData({
            ...windowData,
            columns: [
              { key: "Field", label: "Field" },
              { key: "Value", label: "Value" },
            ],
            rows: visibleColumns.map((column, index) => ({
              __rowNumber: index,
              Field: column.label,
              Value: formatCell(row[column.key]),
            })),
            offset: 0,
            totalRows: visibleColumns.length,
            totalColumns: 2,
          });
          setDisplay((current) => ({
            ...current,
            visibleColumns: ["Field", "Value"],
          }));
        }
      }
    },
    [
      applyState,
      copyToClipboard,
      exportCsv,
      fullscreenOpen,
      handleSort,
      moveSelection,
      offset,
      selectAllVisible,
      selectedCells,
      selectionAnchor,
      showColumnStats,
      visibleColumns,
      windowData,
    ],
  );

  const virtualizer = useVirtualizer({
    count: windowData.totalRows,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => display.rowHeight,
    overscan: 10,
    enabled: display.mode === "virtual",
  });
  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualIndex = virtualItems[0]?.index ?? 0;

  useEffect(() => {
    if (display.mode !== "virtual") return;
    const nextOffset =
      Math.floor(firstVirtualIndex / display.pageSize) * display.pageSize;
    if (nextOffset !== offset) {
      void fetchWindow(nextOffset);
    }
  }, [display.mode, display.pageSize, fetchWindow, firstVirtualIndex, offset]);

  const tableBody = (
    <TableBody
      columns={visibleColumns}
      display={display}
      offset={offset}
      pending={pending}
      selectedCells={selectedCells}
      selectedRows={selectedRows}
      selectedColumns={selectedColumns}
      windowData={windowData}
      virtualPaddingTop={
        display.mode === "virtual" && virtualItems.length > 0
          ? virtualItems[0]!.start
          : 0
      }
      virtualPaddingBottom={
        display.mode === "virtual" && virtualItems.length > 0
          ? Math.max(
              0,
              virtualizer.getTotalSize() -
                virtualItems[virtualItems.length - 1]!.end,
            )
          : 0
      }
      onCellClick={selectCell}
      activeFilterColumn={activeFilterColumn}
      filterDraft={filterDraft}
      onApplyColumnFilter={applyColumnFilter}
      onColumnSort={handleSort}
      onColumnStats={showColumnStats}
      onClearColumnFilter={clearColumnFilter}
      onColumnFilterOpenChange={setColumnFilterOpen}
      onColumnResize={(columnKey, width) =>
        updateDisplay((current) => ({
          ...current,
          columnWidths: { ...current.columnWidths, [columnKey]: width },
        }))
      }
      onFilterDraftChange={setFilterDraft}
      sort={tableState.sort}
      filters={tableState.filters}
      groupBy={tableState.groupBy}
      groupCounts={windowData.groupCounts ?? {}}
    />
  );

  return (
    <div
      ref={tableRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn("orion-ui-table w-full space-y-2 px-2 py-1.5 outline-none", className)}
    >
      <TableToolbar
        activeViewId={activeViewId}
        display={display}
        search={tableState.search}
        searchInputRef={searchInputRef}
        views={views}
        windowData={windowData}
        onApplyView={applyView}
        onCopy={copyToClipboard}
        onDeleteView={deleteView}
        onExport={exportCsv}
        onReset={resetTable}
        onSaveView={() => setSaveViewOpen(true)}
        onSearch={(nextSearch) =>
          applyState((current) => ({ ...current, search: nextSearch }))
        }
        onSettingsChange={updateDisplay}
        onShortcuts={() => setShortcutsOpen(true)}
        onFullscreen={() => setFullscreenOpen(true)}
        onToggleColumn={setColumnVisible}
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div
        data-testid="orion-table-viewport"
        ref={scrollParentRef}
        className={cn(
          "relative border-y border-border",
          display.mode === "virtual" ? "overflow-auto" : "overflow-x-auto overflow-y-visible",
        )}
        style={{
          maxHeight:
            display.mode === "virtual"
              ? `${Math.max(280, display.pageSize * display.rowHeight)}px`
              : undefined,
          fontSize: `${display.fontSize}px`,
        }}
      >
        {tableBody}
      </div>

      {display.mode === "paginated" && (
        <TableFooter
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={display.pageSize}
          pending={pending}
          selectedCells={selectedCells}
          selectedColumns={selectedColumns}
          selectedRows={selectedRows}
          totalColumns={windowData.totalColumns}
          totalRows={windowData.totalRows}
          onPageChange={(page) =>
            void fetchWindow((page - 1) * display.pageSize)
          }
          onPageSizeChange={(nextPageSize) =>
            updateDisplay((current) => ({ ...current, pageSize: nextPageSize }))
          }
        />
      )}

      <SaveViewDialog
        name={newViewName}
        open={saveViewOpen}
        onNameChange={setNewViewName}
        onOpenChange={setSaveViewOpen}
        onSave={saveCurrentView}
      />
      <StatsDialog
        open={statsOpen}
        stats={stats}
        onOpenChange={setStatsOpen}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="flex h-[90vh] max-w-[95vw] flex-col">
          <DialogHeader>
            <DialogTitle className={title ? undefined : "sr-only"}>
              {title || "Table"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto border-y border-border">
            {tableBody}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TableToolbarProps {
  activeViewId: string | null;
  display: DisplaySettings;
  search: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  views: OrionTableSavedView[];
  windowData: OrionTableWindow;
  onApplyView: (view: OrionTableSavedView | null) => void;
  onCopy: () => Promise<void>;
  onDeleteView: (viewId: string) => void;
  onExport: () => Promise<void>;
  onFullscreen: () => void;
  onReset: () => void;
  onSaveView: () => void;
  onSearch: (search: string) => void;
  onSettingsChange: (updater: (current: DisplaySettings) => DisplaySettings) => void;
  onShortcuts: () => void;
  onToggleColumn: (columnKey: string, visible: boolean) => void;
}

const FOOTER_PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100, 250, 500];

/** Tracks a component's rendered width so embedded tables can adapt to their container. */
function useElementWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry?.contentRect.width ?? 0);
      setWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    });
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  return [ref, width];
}

/** Returns compact page choices without creating huge menu lists. */
function paginationPageOptions(currentPage: number, pageCount: number): number[] {
  if (pageCount <= 200) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= pageCount) pages.add(page);
  }
  return Array.from(pages).sort((left, right) => left - right);
}

/** Formats the current selection summary for the footer. */
function selectionSummary(
  selectedCells: Set<string>,
  selectedColumns: Set<string>,
  selectedRows: Set<number>,
): string {
  if (selectedCells.size > 0) {
    return `${selectedCells.size.toLocaleString()} ${
      selectedCells.size === 1 ? "cell" : "cells"
    } selected`;
  }
  if (selectedRows.size > 0) {
    return `${selectedRows.size.toLocaleString()} ${
      selectedRows.size === 1 ? "row" : "rows"
    } selected`;
  }
  if (selectedColumns.size > 0) {
    return `${selectedColumns.size.toLocaleString()} ${
      selectedColumns.size === 1 ? "column" : "columns"
    } selected`;
  }
  return "No selection";
}

/** Pagination footer styled like a compact spreadsheet status bar. */
function TableFooter({
  currentPage,
  pageCount,
  pageSize,
  pending,
  selectedCells,
  selectedColumns,
  selectedRows,
  totalColumns,
  totalRows,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  pageCount: number;
  pageSize: number;
  pending: boolean;
  selectedCells: Set<string>;
  selectedColumns: Set<string>;
  selectedRows: Set<number>;
  totalColumns: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}): React.JSX.Element {
  const [footerRef, footerWidth] = useElementWidth<HTMLDivElement>();
  const pageOptions = paginationPageOptions(currentPage, pageCount);
  const pageSizeOptions = Array.from(
    new Set([...FOOTER_PAGE_SIZE_OPTIONS, pageSize]),
  ).sort((left, right) => left - right);
  const selection = selectionSummary(selectedCells, selectedColumns, selectedRows);
  const compact = footerWidth > 0 && footerWidth < FOOTER_COMPACT_WIDTH;
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= pageCount;

  return (
    <div
      ref={footerRef}
      className={cn(
        "grid min-w-0 items-center gap-1 px-1 py-0 text-xs",
        compact
          ? "grid-cols-[minmax(0,1fr)_auto] gap-y-1"
          : "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
      )}
    >
      <div className="min-w-0 truncate whitespace-nowrap text-muted-foreground">
        {totalRows.toLocaleString()} rows,{" "}
        {totalColumns.toLocaleString()} {compact ? "cols" : "columns"}
      </div>

      <div
        className={cn(
          "flex min-w-0 items-center justify-center gap-1",
          compact && "col-span-2 row-start-2",
        )}
      >
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number.parseInt(value, 10))}
        >
          <SelectTrigger
            className={cn(
              "h-6 px-2 text-xs",
              compact ? "w-14" : "w-[6.75rem]",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option.toLocaleString()}
                {!compact && " / page"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex min-w-0 items-center gap-0.5 text-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            aria-label="First page"
            disabled={isFirstPage || pending}
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            aria-label="Previous page"
            disabled={isFirstPage || pending}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="shrink-0 px-0.5">Page</span>
          <Select
            value={String(currentPage)}
            onValueChange={(value) => onPageChange(Number.parseInt(value, 10))}
          >
            <SelectTrigger className="h-6 w-12 shrink-0 px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageOptions.map((page) => (
                <SelectItem key={page} value={String(page)}>
                  {page.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="shrink-0">
            {compact ? "/" : "of"} {pageCount.toLocaleString()}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-foreground"
            aria-label="Next page"
            disabled={isLastPage || pending}
            onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-foreground"
            aria-label="Last page"
            disabled={isLastPage || pending}
            onClick={() => onPageChange(pageCount)}
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-w-0 truncate whitespace-nowrap text-right italic text-muted-foreground">
        {selection}
      </div>
    </div>
  );
}

/** Render the search bar, saved views, and table command buttons. */
function TableToolbar({
  activeViewId,
  display,
  search,
  searchInputRef,
  views,
  windowData,
  onApplyView,
  onCopy,
  onDeleteView,
  onExport,
  onFullscreen,
  onReset,
  onSaveView,
  onSearch,
  onSettingsChange,
  onShortcuts,
  onToggleColumn,
}: TableToolbarProps): React.JSX.Element {
  const [toolbarRef, toolbarWidth] = useElementWidth<HTMLDivElement>();
  const compactSearch = toolbarWidth > 0 && toolbarWidth < SEARCH_COLLAPSE_WIDTH;
  const showViewTabs = views.length > 0;
  const actionButtons = (
    <div className="flex h-8 shrink-0 items-center gap-1">
      <ToolbarIcon label="Keyboard shortcuts" onClick={onShortcuts}>
        <HelpCircle className="h-4 w-4" />
      </ToolbarIcon>
      <ToolbarIcon label="Fullscreen" onClick={onFullscreen}>
        <Maximize2 className="h-4 w-4" />
      </ToolbarIcon>
      <ToolbarIcon label="Reset table" onClick={onReset}>
        <RotateCcw className="h-4 w-4" />
      </ToolbarIcon>
      <ColumnMenu
        columns={windowData.columns}
        visibleColumns={display.visibleColumns}
        onToggleColumn={onToggleColumn}
      />
      <ToolbarIcon label="Copy current view" onClick={() => void onCopy()}>
        <Clipboard className="h-4 w-4" />
      </ToolbarIcon>
      <ToolbarIcon label="Export CSV" onClick={() => void onExport()}>
        <Download className="h-4 w-4" />
      </ToolbarIcon>
      <SettingsMenu
        display={display}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={toolbarRef}
        className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5"
      >
        <TableSearchControl
          compact={compactSearch}
          search={search}
          searchInputRef={searchInputRef}
          onSearch={onSearch}
        />

        {showViewTabs && (
          <Tabs
            value={activeViewId ?? "default"}
            className="min-w-0 max-w-full shrink"
          >
            <TabsList className="h-8 max-w-full gap-1 overflow-x-auto p-1">
              <TabsTrigger
                value="default"
                className="h-6 px-2 py-0 text-xs"
                onClick={() => onApplyView(null)}
              >
                Default
              </TabsTrigger>
              {views.map((view) => (
                <TabsTrigger
                  key={view.id}
                  value={view.id}
                  className="group h-6 gap-1 px-2 py-0 text-xs"
                  onClick={() => onApplyView(view)}
                >
                  {view.name}
                  <button
                    type="button"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteView(view.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <ToolbarIcon label="Save current view" onClick={onSaveView}>
          <Plus className="h-4 w-4" />
        </ToolbarIcon>
        <div className="ml-auto shrink-0">{actionButtons}</div>
      </div>
    </div>
  );
}

/** Search control that collapses to an icon popover in narrow embedded tables. */
function TableSearchControl({
  compact,
  search,
  searchInputRef,
  onSearch,
}: {
  compact: boolean;
  search: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearch: (search: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [open, searchInputRef]);

  const searchInput = (
    <div className="relative h-8">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={searchInputRef}
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Search all columns..."
        className="h-8 pl-8 pr-8"
      />
      {search && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-8 w-8"
          onClick={() => onSearch("")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  if (!compact) {
    return <div className="w-72 shrink-0">{searchInput}</div>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 shrink-0", search && "text-primary")}
              aria-label="Search table"
            >
              <Search className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Search table</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72 p-2">
        {searchInput}
      </PopoverContent>
    </Popover>
  );
}

/** Icon-only toolbar button with a tooltip. */
function ToolbarIcon({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Dropdown used to show/hide table columns. */
function ColumnMenu({
  columns,
  visibleColumns,
  onToggleColumn,
}: {
  columns: OrionTableColumn[];
  visibleColumns: string[];
  onToggleColumn: (columnKey: string, visible: boolean) => void;
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Columns"
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Columns</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={visibleColumns.includes(column.key)}
            onCheckedChange={(checked) => onToggleColumn(column.key, checked)}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Settings popover for table display behavior. */
function SettingsMenu({
  display,
  onSettingsChange,
}: {
  display: DisplaySettings;
  onSettingsChange: (updater: (current: DisplaySettings) => DisplaySettings) => void;
}): React.JSX.Element {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Settings"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Mode</Label>
          <Select
            value={display.mode}
            onValueChange={(value) =>
              onSettingsChange((current) => ({
                ...current,
                mode: value === "virtual" ? "virtual" : "paginated",
              }))
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paginated">Paginated</SelectItem>
              <SelectItem value="virtual">Scrollable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumberSetting
            label="Rows"
            value={display.pageSize}
            min={5}
            max={500}
            onChange={(value) =>
              onSettingsChange((current) => ({ ...current, pageSize: value }))
            }
          />
          <NumberSetting
            label="Height"
            value={display.rowHeight}
            min={24}
            max={96}
            onChange={(value) =>
              onSettingsChange((current) => ({ ...current, rowHeight: value }))
            }
          />
          <NumberSetting
            label="Font"
            value={display.fontSize}
            min={10}
            max={20}
            onChange={(value) =>
              onSettingsChange((current) => ({ ...current, fontSize: value }))
            }
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start"
          onClick={() =>
            onSettingsChange((current) => ({
              ...current,
              freezeHeader: !current.freezeHeader,
            }))
          }
        >
          {display.freezeHeader ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
          Sticky header
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Numeric setting input with bounds. */
function NumberSetting({
  label,
  max,
  min,
  value,
  onChange,
}: {
  label: string;
  max: number;
  min: number;
  value: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="h-8"
      />
    </div>
  );
}

interface TableBodyProps {
  activeFilterColumn: string | null;
  columns: OrionTableColumn[];
  display: DisplaySettings;
  filterDraft: { operation: OrionTableFilterOperation; value: string };
  filters: OrionTableFilter[];
  groupBy: string | null;
  groupCounts: Record<string, number>;
  offset: number;
  pending: boolean;
  selectedCells: Set<string>;
  selectedColumns: Set<string>;
  selectedRows: Set<number>;
  sort: OrionTableState["sort"];
  virtualPaddingBottom: number;
  virtualPaddingTop: number;
  windowData: OrionTableWindow;
  onApplyColumnFilter: (columnKey: string) => void;
  onCellClick: (row: OrionTableRow, columnKey: string, event?: React.MouseEvent) => void;
  onClearColumnFilter: (columnKey: string) => void;
  onColumnFilterOpenChange: (columnKey: string, open: boolean) => void;
  onColumnResize: (columnKey: string, width: number) => void;
  onColumnSort: (columnKey: string) => void;
  onColumnStats: (columnKey: string) => void;
  onFilterDraftChange: (draft: { operation: OrionTableFilterOperation; value: string }) => void;
}

/** Render the scrollable table grid using the latest backend window. */
function TableBody({
  activeFilterColumn,
  columns,
  display,
  filterDraft,
  filters,
  groupBy,
  groupCounts,
  offset,
  pending,
  selectedCells,
  selectedColumns,
  selectedRows,
  sort,
  virtualPaddingBottom,
  virtualPaddingTop,
  windowData,
  onApplyColumnFilter,
  onCellClick,
  onClearColumnFilter,
  onColumnFilterOpenChange,
  onColumnResize,
  onColumnSort,
  onColumnStats,
  onFilterDraftChange,
}: TableBodyProps): React.JSX.Element {
  let lastGroup: string | undefined;
  return (
    <table className="w-full min-w-max border-collapse">
      <thead
        className={cn(
          display.freezeHeader && "sticky top-0 z-20 bg-muted/90 backdrop-blur",
        )}
      >
        <tr>
          {columns.map((column) => {
            const width = display.columnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH;
            const isSorted = sort?.column === column.key;
            const hasFilter = filters.some((filter) => filter.column === column.key);
            return (
              <th
                key={column.key}
                className={cn(
                  "relative border-b border-border px-2 py-1 text-left font-medium text-muted-foreground",
                  selectedColumns.has(column.key) && "bg-primary/10",
                )}
                style={{ width, maxWidth: width }}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    className="min-w-0 truncate"
                    onDoubleClick={() => onColumnStats(column.key)}
                  >
                    {column.label}
                  </button>
                  {column.description ? (
                    <ColumnDescriptionTooltip
                      columnLabel={column.label}
                      description={column.description}
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onColumnSort(column.key)}
                  >
                    {isSorted ? (
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-primary",
                          sort.direction === "asc" && "rotate-180",
                        )}
                      />
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {!column.isIndex && (
                    <FilterPopover
                      columnKey={column.key}
                      draft={filterDraft}
                      hasFilter={hasFilter}
                      open={activeFilterColumn === column.key}
                      onApply={() => onApplyColumnFilter(column.key)}
                      onClear={() => onClearColumnFilter(column.key)}
                      onDraftChange={onFilterDraftChange}
                      onOpenChange={(open) =>
                        onColumnFilterOpenChange(column.key, open)
                      }
                    />
                  )}
                </div>
                <div
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    const startX = event.clientX;
                    const startWidth = width;
                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      onColumnResize(
                        column.key,
                        Math.max(
                          MIN_COLUMN_WIDTH,
                          startWidth + moveEvent.clientX - startX,
                        ),
                      );
                    };
                    const handleMouseUp = () => {
                      document.removeEventListener("mousemove", handleMouseMove);
                      document.removeEventListener("mouseup", handleMouseUp);
                    };
                    document.addEventListener("mousemove", handleMouseMove);
                    document.addEventListener("mouseup", handleMouseUp);
                  }}
                />
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className={cn(pending && "opacity-60")}>
        {virtualPaddingTop > 0 && (
          <tr>
            <td colSpan={columns.length} style={{ height: virtualPaddingTop }} />
          </tr>
        )}
        {windowData.rows.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className="h-24 text-center text-sm text-muted-foreground"
            >
              No results found.
            </td>
          </tr>
        ) : (
          windowData.rows.map((row, rowIndex) => {
            const absoluteRow = rowNumber(row, offset + rowIndex);
            const groupValue =
              typeof row.__orion_group_value === "string"
                ? row.__orion_group_value
                : undefined;
            const shouldRenderGroup =
              groupBy && groupValue !== undefined && groupValue !== lastGroup;
            lastGroup = groupValue ?? lastGroup;

            return (
              <React.Fragment key={absoluteRow}>
                {shouldRenderGroup && (
                  <tr className="bg-muted/60">
                    <td
                      colSpan={columns.length}
                      className="border-b border-border px-2 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {groupBy}: {groupValue} ({groupCounts[groupValue ?? ""] ?? 0})
                    </td>
                  </tr>
                )}
                <tr
                  className={cn(
                    "border-b border-border/60 hover:bg-muted/40",
                    selectedRows.has(absoluteRow) && "bg-primary/10",
                  )}
                >
                  {columns.map((column) => {
                    const key = cellKey(absoluteRow, column.key);
                    const width = display.columnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH;
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "cursor-default select-none px-2 py-1 align-top font-mono",
                          selectedCells.has(key) && "bg-primary/20",
                          selectedColumns.has(column.key) && "bg-primary/10",
                        )}
                        style={{
                          width,
                          maxWidth: width,
                          height: display.rowHeight,
                        }}
                        title={formatCell(row[column.key])}
                        onMouseDown={(event) => onCellClick(row, column.key, event)}
                      >
                        <div className="max-w-[24rem] truncate">
                          {formatCell(row[column.key])}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })
        )}
        {virtualPaddingBottom > 0 && (
          <tr>
            <td colSpan={columns.length} style={{ height: virtualPaddingBottom }} />
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Info affordance for a table column description. */
function ColumnDescriptionTooltip({
  columnLabel,
  description,
}: {
  columnLabel: string;
  description: string;
}): React.JSX.Element {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm",
            "text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`About ${columnLabel}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

/** Anchored popup for applying a filter to one table column. */
function FilterPopover({
  columnKey,
  draft,
  hasFilter,
  open,
  onApply,
  onClear,
  onDraftChange,
  onOpenChange,
}: {
  columnKey: string;
  draft: { operation: OrionTableFilterOperation; value: string };
  hasFilter: boolean;
  open: boolean;
  onApply: () => void;
  onClear: () => void;
  onDraftChange: (draft: { operation: OrionTableFilterOperation; value: string }) => void;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6", hasFilter && "text-primary")}
          aria-label={`Filter ${columnKey}`}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="space-y-1">
          <Label className="text-xs">Filter {columnKey}</Label>
          <Select
            value={draft.operation}
            onValueChange={(value) =>
              onDraftChange({
                ...draft,
                operation: value as OrionTableFilterOperation,
              })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPERATIONS.map((operation) => (
                <SelectItem key={operation.value} value={operation.value}>
                  {operation.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={draft.value}
          onChange={(event) => onDraftChange({ ...draft, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") onApply();
          }}
          placeholder="Filter value..."
          className="h-8"
        />
        <div className="flex justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
          <Button type="button" size="sm" onClick={onApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Dialog for naming and saving the current table view. */
function SaveViewDialog({
  name,
  open,
  onNameChange,
  onOpenChange,
  onSave,
}: {
  name: string;
  open: boolean;
  onNameChange: (name: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save View</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void onSave();
            }}
            placeholder="View name"
          />
          <Button type="button" size="sm" onClick={() => void onSave()}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog displaying backend-computed column statistics. */
function StatsDialog({
  open,
  stats,
  onOpenChange,
}: {
  open: boolean;
  stats: OrionTableStats | null;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{stats ? `Stats: ${stats.column}` : "Stats"}</DialogTitle>
        </DialogHeader>
        {stats && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Count" value={stats.count} />
              <Stat label="Numeric" value={stats.numericCount} />
              <Stat label="Sum" value={stats.sum} />
              <Stat label="Min" value={stats.min} />
              <Stat label="Max" value={stats.max} />
              <Stat label="Avg" value={stats.avg} />
            </div>
            <Separator />
            <div className="max-h-64 overflow-auto">
              {stats.uniqueValues.map((entry) => (
                <div
                  key={entry.value}
                  className="flex items-center justify-between gap-4 border-b border-border/60 py-1 text-xs"
                >
                  <span className="truncate font-mono">{entry.value}</span>
                  <span className="text-muted-foreground">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One compact statistics row. */
function Stat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">
        {value === null ? "" : Number.isInteger(value) ? value : value.toFixed(3)}
      </span>
    </div>
  );
}

/** Dialog documenting table keyboard shortcuts. */
function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const shortcuts = [
    ["Arrow keys", "Move cell"],
    ["Shift + arrows", "Extend selection"],
    ["Cmd/Ctrl + A", "Select visible cells"],
    ["Shift + Space", "Select row"],
    ["Ctrl + Space", "Select column"],
    ["A", "Focus search"],
    ["F", "Filter column"],
    ["S", "Sort column"],
    ["G", "Group column"],
    ["U", "Column stats"],
    ["Space", "Filter by selected value"],
    ["> / <", "Inclusive comparison filter"],
    ["Alt + > / <", "Strict comparison filter"],
    ["Shift + F", "Fullscreen"],
    ["C / Cmd+C", "Copy"],
    ["X", "Export CSV"],
    ["Tab", "Transpose row"],
    ["Esc", "Clear or close"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {shortcuts.map(([keys, action]) => (
            <div key={keys} className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
              <div className="rounded bg-muted px-2 py-1 font-mono text-xs">
                {keys}
              </div>
              <div>{action}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
