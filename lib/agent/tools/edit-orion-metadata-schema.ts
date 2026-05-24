/**
 * Zod schemas for the edit_orion_metadata tool and Orion metadata contract.
 *
 * The metadata schemas validate known Orion-owned fields while allowing
 * unknown keys so existing notebooks with legacy metadata remain editable.
 */

import { z } from "zod";

import {
  BUILTIN_APP_VIEW_PRIMITIVES,
  NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
} from "@/lib/notebook/app-view";

const JsonObjectSchema = z.record(z.string(), z.unknown());
const PositiveIntegerSchema = z.number().int().positive();
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const DateLikeSchema = z.union([z.string(), z.date()]);

const AppLayoutItemSchema = z
  .object({
    x: NonNegativeIntegerSchema.describe("Non-negative grid x position."),
    y: NonNegativeIntegerSchema.describe("Non-negative grid y position."),
    w: PositiveIntegerSchema.describe("Positive grid width."),
    h: PositiveIntegerSchema.describe("Positive grid height."),
  })
  .passthrough();

const GridTupleSchema = z
  .tuple([NonNegativeIntegerSchema, NonNegativeIntegerSchema])
  .describe("Two non-negative integer values: [x, y].");

interface AppViewSchemaNodeInput {
  type: string;
  props?: Record<string, unknown>;
  children?: AppViewSchemaNodeInput[];
}

const AppViewSchemaPropsSchema = z
  .record(z.string(), z.unknown())
  .superRefine((props, ctx) => {
    if ("className" in props) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["className"],
        message: "className is not supported in app-view schema v1",
      });
    }

    if ("style" in props) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["style"],
        message: "style is not supported in app-view schema v1",
      });
    }
  });

const AppViewSchemaNodeSchema: z.ZodType<AppViewSchemaNodeInput> = z.lazy(() =>
  z.object({
    type: z.enum(BUILTIN_APP_VIEW_PRIMITIVES),
    props: AppViewSchemaPropsSchema.optional(),
    children: z.array(AppViewSchemaNodeSchema).optional(),
  }),
);

const AppViewSchemaSchema = z.object({
  version: z.literal(NOTEBOOK_APP_VIEW_SCHEMA_VERSION),
  primitiveRegistry: z.object({
    source: z.literal("builtin"),
  }),
  root: AppViewSchemaNodeSchema,
});

export const NotebookOrionMetadataSchema = z
  .object({
    subagent: z
      .object({
        model: z
          .string()
          .refine((value) => value.trim().length > 0, "model must be a non-empty string when present")
          .optional()
          .describe("Optional non-empty model id for notebook-defined sub-agents."),
        "disable-model-invocation": z
          .boolean()
          .optional()
          .describe("When true, hide this sub-agent from model-driven delegation."),
      })
      .passthrough()
      .optional()
      .describe("Notebook-defined sub-agent options."),
    appView: z
      .object({
        version: PositiveIntegerSchema.optional().describe("App-view metadata version."),
        grid: z
          .object({
            cols: PositiveIntegerSchema.optional(),
            rowHeight: PositiveIntegerSchema.optional(),
            margin: GridTupleSchema.optional(),
            containerPadding: GridTupleSchema.optional(),
          })
          .passthrough()
          .optional()
          .describe("App-view grid configuration."),
        layout: z
          .record(AppLayoutItemSchema)
          .optional()
          .describe("App-view layout keyed by cell id or output app item id."),
        schema: AppViewSchemaSchema.optional().describe(
          "Declarative app-view schema rendered through Orion's built-in primitive registry.",
        ),
      })
      .passthrough()
      .optional()
      .describe("Notebook app-view layout metadata."),
  })
  .passthrough();

const ExecutionStatisticsSchema = z
  .object({
    wallTime: z.number().optional(),
    cpuTime: z.number().optional(),
    memoryUsage: z.number().optional(),
    peakMemory: z.number().optional(),
    ioRead: z.number().optional(),
    ioWrite: z.number().optional(),
  })
  .passthrough();

const CellAppMetadataSchema: z.ZodType<{
  enabled?: boolean;
  title?: string;
  outputs?: Record<string, unknown>;
}> = z.lazy(() =>
  z
    .object({
      enabled: z.boolean().optional(),
      title: z.string().optional(),
      outputs: z.record(CellAppMetadataSchema).optional(),
    })
    .passthrough()
);

export const CellOrionMetadataSchema = z
  .object({
    id: z.string().min(1).optional().describe("Stable Orion-managed cell id."),
    cellState: z
      .object({
        isInputHidden: z.boolean().optional(),
        isOutputHidden: z.boolean().optional(),
        isWholeCellHidden: z.boolean().optional(),
        isMuted: z.boolean().optional(),
        isInputCollapsed: z.boolean().optional(),
        isOutputCollapsed: z.boolean().optional(),
        executionInfo: z
          .object({
            status: z.enum(["idle", "running", "success", "error"]).optional(),
            startTime: DateLikeSchema.optional(),
            endTime: DateLikeSchema.optional(),
            lastExecuted: DateLikeSchema.optional(),
            duration: z.number().optional(),
            statistics: ExecutionStatisticsSchema.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional()
      .describe("Notebook UI/runtime state for the cell."),
    app: CellAppMetadataSchema.optional().describe("Cell and output app-view inclusion metadata."),
    cellType: z.literal("raw").optional().describe("Legacy muted-cell marker."),
    _parseError: z.unknown().optional().describe("Internal notebook parser recovery metadata."),
  })
  .passthrough();

export const EditOrionMetadataEntrySchema = z
  .object({
    target: z
      .enum(["notebook", "cell"])
      .describe("Whether to edit notebook metadata.orion or a cell's metadata.orion."),
    cellIndex: z
      .number()
      .int()
      .describe("Zero-based cell index for target='cell'. Use -1 for target='notebook'."),
    operation: z
      .enum(["merge", "replace", "delete"])
      .describe(
        "'merge' recursively merges a JSON object into an existing object, 'replace' overwrites the exact path, and 'delete' removes the exact path."
      ),
    path: z
      .array(z.string().min(1))
      .describe(
        "Path segments inside metadata.orion. Use [] for the metadata.orion root, e.g. ['cellState','isOutputHidden'] targets metadata.orion.cellState.isOutputHidden."
      ),
    valueJson: z
      .string()
      .describe(
        "JSON value for merge/replace. Merge requires a JSON object and rejects arrays/scalars. Pass an empty string \"\" for delete."
      ),
  })
  .superRefine((edit, ctx) => {
    if (edit.target === "notebook" && edit.cellIndex !== -1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cellIndex"],
        message: "notebook target must use cellIndex -1",
      });
    }
    if (edit.target === "cell" && edit.cellIndex < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cellIndex"],
        message: "cell target must use a non-negative cellIndex",
      });
    }
  });

export const EditOrionMetadataParamsSchema = z.object({
  notebookId: z
    .string()
    .describe(
      "ID returned by use_notebook for the notebook to edit. Pass an empty string \"\" to edit the currently active notebook."
    ),
  edits: z
    .array(EditOrionMetadataEntrySchema)
    .min(1)
    .describe("One or more Orion metadata edits applied in order."),
});

export type ParsedEditOrionMetadataEntry = z.infer<typeof EditOrionMetadataEntrySchema>;
export type ParsedEditOrionMetadataParams = z.infer<typeof EditOrionMetadataParamsSchema>;

/** Checks whether a parsed JSON value is a JSON object suitable for Orion metadata roots. */
export function isJsonObjectValue(value: unknown): value is Record<string, unknown> {
  return JsonObjectSchema.safeParse(value).success && !Array.isArray(value);
}
