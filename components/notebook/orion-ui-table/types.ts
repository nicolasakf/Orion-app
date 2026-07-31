import { z } from "zod";

export const ORION_TABLE_COMM_TARGET = "orion.ui.table";

const TableCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const OrionTableFilterKindSchema = z.enum([
  "text",
  "categorical",
  "boolean",
  "number",
  "date",
  "datetime",
  "timedelta",
  "period",
  "complex",
  "interval",
  "binary",
  "fallback",
  "empty",
]);

export const OrionTableFilterOperationSchema = z.enum([
  "contains",
  "doesNotContain",
  "startsWith",
  "endsWith",
  "equals",
  "notEquals",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "between",
  "in",
  "notIn",
  "onDate",
  "blank",
  "notBlank",
  "regex",
]);

export const OrionTableColumnSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    dtype: z.string().optional(),
    filterKind: OrionTableFilterKindSchema.optional(),
    filterOperations: z.array(OrionTableFilterOperationSchema).optional(),
    filterOptions: z.array(TableCellValueSchema).optional(),
    ordered: z.boolean().optional(),
    timezone: z.string().optional(),
    frequency: z.string().optional(),
    numericType: z.enum(["integer", "float", "decimal"]).optional(),
    isIndex: z.boolean().optional(),
    description: z.string().optional(),
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

export const OrionTableFilterValueResponseSchema = z
  .object({
    value: z.string(),
  })
  .passthrough();

export const OrionTableCommResponseSchema = z.union([
  OrionTableWindowSchema,
  OrionTableStatsSchema,
  OrionTableExportSchema,
  OrionTableFilterValueResponseSchema,
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
export type OrionTableFilterKind = z.infer<typeof OrionTableFilterKindSchema>;
export type OrionTableFilterOperation = z.infer<
  typeof OrionTableFilterOperationSchema
>;
export type OrionTableFilterValue =
  | string
  | string[]
  | { lower: string; upper: string };

export const OrionTableSortSchema = z.object({
  column: z.string(),
  direction: z.enum(["asc", "desc"]),
});

export const OrionTableFilterSchema = z.object({
  column: z.string(),
  operation: OrionTableFilterOperationSchema,
  value: z
    .union([
      z.string(),
      z.array(z.string()),
      z.object({ lower: z.string(), upper: z.string() }),
    ])
    .default(""),
});

export const OrionTableStateSchema = z.object({
  search: z.string(),
  sort: OrionTableSortSchema.nullable(),
  filters: z.array(OrionTableFilterSchema),
  groupBy: z.string().nullable(),
});

export type OrionTableFilter = z.infer<typeof OrionTableFilterSchema>;
export type OrionTableState = z.infer<typeof OrionTableStateSchema>;

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
    }
  | {
      action: "filter_value";
      tableId: string;
      state: OrionTableState;
      rowNumber: number;
      column: string;
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
  version: 1 | 2;
  activeViewId?: string | null;
  views: OrionTableSavedView[];
}
