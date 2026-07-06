import { z } from "zod";

export const ORION_TABLE_COMM_TARGET = "orion.ui.table";

const TableCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const OrionTableColumnSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    dtype: z.string().optional(),
    isIndex: z.boolean().optional(),
  })
  .passthrough();

export const OrionTableRowSchema = z.record(TableCellValueSchema);

export const OrionTableWindowSchema = z
  .object({
    tableId: z.string(),
    columns: z.array(OrionTableColumnSchema),
    rows: z.array(OrionTableRowSchema),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    totalRows: z.number().int().nonnegative(),
    sourceRows: z.number().int().nonnegative().optional(),
    totalColumns: z.number().int().nonnegative(),
    groupBy: z.string().nullable().optional(),
    groupCounts: z.record(z.number().int().nonnegative()).optional(),
    expression: z.string().optional(),
  })
  .passthrough();

export const OrionTableStatsSchema = z
  .object({
    column: z.string(),
    count: z.number().int().nonnegative(),
    numericCount: z.number().int().nonnegative(),
    sum: z.number().nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    avg: z.number().nullable(),
    uniqueValues: z.array(
      z.object({
        value: z.string(),
        count: z.number().int().nonnegative(),
      }),
    ),
  })
  .passthrough();

export const OrionTableExportSchema = z
  .object({
    csv: z.string(),
    rowCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    expression: z.string().optional(),
  })
  .passthrough();

export const OrionTableCommResponseSchema = z.union([
  OrionTableWindowSchema,
  OrionTableStatsSchema,
  OrionTableExportSchema,
  z.object({ expression: z.string() }).passthrough(),
]);

export const OrionTableCommEnvelopeSchema = z.union([
  z
    .object({
      requestId: z.string(),
      ok: z.literal(true),
      result: OrionTableCommResponseSchema,
    })
    .passthrough(),
  z
    .object({
      requestId: z.string(),
      ok: z.literal(false),
      error: z.string().optional(),
    })
    .passthrough(),
]);

export type OrionTableColumn = z.infer<typeof OrionTableColumnSchema>;
export type OrionTableRow = z.infer<typeof OrionTableRowSchema>;
export type OrionTableWindow = z.infer<typeof OrionTableWindowSchema>;
export type OrionTableStats = z.infer<typeof OrionTableStatsSchema>;
export type OrionTableExport = z.infer<typeof OrionTableExportSchema>;
export type OrionTableCommResponse = z.infer<typeof OrionTableCommResponseSchema>;
export type OrionTableCommEnvelope = z.infer<typeof OrionTableCommEnvelopeSchema>;

export type OrionTableMode = "paginated" | "virtual";
export type OrionTableSortDirection = "asc" | "desc";
export type OrionTableFilterOperation =
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
  | "regex";

export interface OrionTableFilter {
  column: string;
  operation: OrionTableFilterOperation;
  value: string;
}

export interface OrionTableState {
  search: string;
  sort: { column: string; direction: OrionTableSortDirection } | null;
  filters: OrionTableFilter[];
  groupBy: string | null;
}

export type OrionTableRequest =
  | {
      action: "fetch";
      tableId: string;
      state: OrionTableState;
      offset: number;
      limit: number;
    }
  | {
      action: "stats";
      tableId: string;
      state: OrionTableState;
      column: string;
    }
  | {
      action: "export_csv";
      tableId: string;
      state: OrionTableState;
      columns: string[];
    }
  | {
      action: "expression";
      tableId: string;
      state: OrionTableState;
    };

export interface OrionTableSavedView {
  id: string;
  name: string;
  operations: OrionTableState;
  expression: string;
  display: {
    mode: OrionTableMode;
    pageSize: number;
    visibleColumns: string[];
    columnWidths: Record<string, number>;
    freezeHeader: boolean;
    fontSize: number;
    rowHeight: number;
  };
}

export interface OrionTableOutputMetadata {
  version: 1;
  activeViewId?: string | null;
  views: OrionTableSavedView[];
}
