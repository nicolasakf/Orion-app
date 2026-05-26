import {
  CellType,
  type NotebookCellType,
  type NotebookType,
} from "@/lib/types";

export const NOTEBOOK_APP_VIEW_VERSION = 1;
export const NOTEBOOK_APP_GRID_COLUMNS = 24;
export const NOTEBOOK_APP_GRID_ROW_HEIGHT = 44;
export const NOTEBOOK_APP_VIEW_SCHEMA_VERSION = 1;
export const ORION_UI_MIME_TYPE = "application/vnd.orion.ui+json";

export const BUILTIN_APP_VIEW_PRIMITIVES = [
  "Page",
  "Stack",
  "Grid",
  "Section",
  "Card",
  "Tabs",
  "MarkdownCell",
  "Output",
  "Button",
  "Input",
  "Textarea",
  "Select",
  "Slider",
  "Checkbox",
  "Switch",
  "Label",
  "Badge",
  "Separator",
] as const;

export type NotebookAppGridTuple = [number, number];
export type BuiltinAppViewPrimitive = (typeof BUILTIN_APP_VIEW_PRIMITIVES)[number];

export interface NotebookAppGridConfig {
  cols: number;
  rowHeight: number;
  margin: NotebookAppGridTuple;
  containerPadding: NotebookAppGridTuple;
}

export interface NotebookCellAppMetadata {
  enabled?: boolean;
  title?: string;
  outputs?: Record<string, NotebookCellAppMetadata>;
}

export interface NotebookAppLayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NotebookAppViewMetadata {
  version: typeof NOTEBOOK_APP_VIEW_VERSION;
  layout: Record<string, NotebookAppLayoutItem>;
  grid: NotebookAppGridConfig;
}

export interface NotebookAppCell {
  cell: NotebookCellType;
  cellIndex: number;
  cellId: string;
  appItemId: string;
  kind: "cell" | "output";
  outputIndex?: number;
  title: string;
}

export interface ReactGridLayoutItem extends NotebookAppLayoutItem {
  i: string;
}

export interface NotebookAppViewSchemaPrimitiveRegistry {
  source: "builtin";
}

export interface NotebookAppViewSchemaNode {
  type: BuiltinAppViewPrimitive;
  props: Record<string, unknown>;
  children: NotebookAppViewSchemaNode[];
}

export interface NotebookAppViewSchema {
  version: typeof NOTEBOOK_APP_VIEW_SCHEMA_VERSION;
  primitiveRegistry: NotebookAppViewSchemaPrimitiveRegistry;
  root: NotebookAppViewSchemaNode;
}

export type OrionUiMimeStateValue = string | number | boolean;

export interface OrionUiMimePayload {
  version: typeof NOTEBOOK_APP_VIEW_SCHEMA_VERSION;
  id?: string;
  root: NotebookAppViewSchemaNode;
  state: Record<string, OrionUiMimeStateValue>;
  bindings: Record<string, unknown>;
}

export type NotebookAppViewSchemaParseResult =
  | { status: "missing" }
  | { status: "valid"; schema: NotebookAppViewSchema }
  | { status: "invalid"; errors: string[] };

export type OrionUiMimePayloadParseResult =
  | { status: "valid"; payload: OrionUiMimePayload }
  | { status: "invalid"; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Checks whether a schema node type is available in the built-in registry. */
function isBuiltinAppViewPrimitive(
  value: unknown,
): value is BuiltinAppViewPrimitive {
  return (
    typeof value === "string" &&
    (BUILTIN_APP_VIEW_PRIMITIVES as readonly string[]).includes(value)
  );
}

/** Adds a path-qualified schema validation message. */
function appendSchemaError(
  errors: string[],
  path: string,
  message: string,
): void {
  errors.push(`${path}: ${message}`);
}

/** Normalizes schema props and rejects unsupported styling escape hatches. */
function normalizeSchemaProps(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    appendSchemaError(errors, path, "props must be an object when present");
    return {};
  }

  if ("className" in value) {
    appendSchemaError(
      errors,
      `${path}.className`,
      "className is not supported in app-view schema v1",
    );
  }

  if ("style" in value) {
    appendSchemaError(
      errors,
      `${path}.style`,
      "style is not supported in app-view schema v1",
    );
  }

  return value;
}

/** Normalizes a recursive schema node into the renderer's internal shape. */
function normalizeSchemaNode(
  value: unknown,
  path: string,
  errors: string[],
): NotebookAppViewSchemaNode | null {
  if (!isRecord(value)) {
    appendSchemaError(errors, path, "node must be an object");
    return null;
  }

  if (!isBuiltinAppViewPrimitive(value.type)) {
    appendSchemaError(
      errors,
      `${path}.type`,
      `unknown primitive '${String(value.type)}'`,
    );
    return null;
  }

  const children: NotebookAppViewSchemaNode[] = [];
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) {
      appendSchemaError(errors, `${path}.children`, "children must be an array");
    } else {
      value.children.forEach((child, index) => {
        const normalized = normalizeSchemaNode(
          child,
          `${path}.children[${index}]`,
          errors,
        );
        if (normalized) {
          children.push(normalized);
        }
      });
    }
  }

  return {
    type: value.type,
    props: normalizeSchemaProps(value.props, `${path}.props`, errors),
    children,
  };
}

/** Reads the raw declarative schema object from notebook metadata. */
function getRawAppViewSchema(
  metadata: NotebookType["metadata"] | undefined,
): unknown {
  const orion = isRecord(metadata?.orion) ? metadata.orion : {};
  const appView = isRecord(orion.appView) ? orion.appView : {};
  return appView.schema;
}

/**
 * Parses notebook-level declarative App View schema metadata.
 */
export function parseNotebookAppViewSchema(
  metadata: NotebookType["metadata"] | undefined,
): NotebookAppViewSchemaParseResult {
  const rawSchema = getRawAppViewSchema(metadata);
  if (rawSchema === undefined) {
    return { status: "missing" };
  }

  const errors: string[] = [];
  if (!isRecord(rawSchema)) {
    return {
      status: "invalid",
      errors: ["metadata.orion.appView.schema: schema must be an object"],
    };
  }

  if (rawSchema.version !== NOTEBOOK_APP_VIEW_SCHEMA_VERSION) {
    appendSchemaError(
      errors,
      "metadata.orion.appView.schema.version",
      `version must be ${NOTEBOOK_APP_VIEW_SCHEMA_VERSION}`,
    );
  }

  const primitiveRegistry = isRecord(rawSchema.primitiveRegistry)
    ? rawSchema.primitiveRegistry
    : {};
  if (primitiveRegistry.source !== "builtin") {
    appendSchemaError(
      errors,
      "metadata.orion.appView.schema.primitiveRegistry.source",
      "only 'builtin' is supported",
    );
  }

  if (rawSchema.root === undefined) {
    appendSchemaError(
      errors,
      "metadata.orion.appView.schema.root",
      "root is required",
    );
  }

  const root =
    rawSchema.root === undefined
      ? null
      : normalizeSchemaNode(
          rawSchema.root,
          "metadata.orion.appView.schema.root",
          errors,
        );

  if (errors.length > 0 || !root) {
    return { status: "invalid", errors };
  }

  return {
    status: "valid",
    schema: {
      version: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
      primitiveRegistry: { source: "builtin" },
      root,
    },
  };
}

/** Parses an Orion UI MIME payload into the shared primitive tree shape. */
export function parseOrionUiMimePayload(
  value: unknown,
): OrionUiMimePayloadParseResult {
  const errors: string[] = [];
  const rawPayload =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            errors.push(`${ORION_UI_MIME_TYPE}: payload string must be valid JSON`);
            return null;
          }
        })()
      : value;

  if (!isRecord(rawPayload)) {
    return {
      status: "invalid",
      errors:
        errors.length > 0
          ? errors
          : [`${ORION_UI_MIME_TYPE}: payload must be an object`],
    };
  }

  if (rawPayload.version !== NOTEBOOK_APP_VIEW_SCHEMA_VERSION) {
    appendSchemaError(
      errors,
      `${ORION_UI_MIME_TYPE}.version`,
      `version must be ${NOTEBOOK_APP_VIEW_SCHEMA_VERSION}`,
    );
  }

  if (rawPayload.id !== undefined && typeof rawPayload.id !== "string") {
    appendSchemaError(errors, `${ORION_UI_MIME_TYPE}.id`, "id must be a string");
  }

  if (rawPayload.root === undefined) {
    appendSchemaError(errors, `${ORION_UI_MIME_TYPE}.root`, "root is required");
  }

  const root =
    rawPayload.root === undefined
      ? null
      : normalizeSchemaNode(rawPayload.root, `${ORION_UI_MIME_TYPE}.root`, errors);

  const rawState = isRecord(rawPayload.state) ? rawPayload.state : {};
  const state: Record<string, OrionUiMimeStateValue> = {};
  for (const [key, entry] of Object.entries(rawState)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      state[key] = entry;
    } else {
      appendSchemaError(
        errors,
        `${ORION_UI_MIME_TYPE}.state.${key}`,
        "state values must be strings, numbers, or booleans",
      );
    }
  }

  if (errors.length > 0 || !root) {
    return { status: "invalid", errors };
  }

  return {
    status: "valid",
    payload: {
      version: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
      id: typeof rawPayload.id === "string" ? rawPayload.id : undefined,
      root,
      state,
      bindings: isRecord(rawPayload.bindings) ? rawPayload.bindings : {},
    },
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finitePositiveInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? Math.floor(number) : null;
}

function finiteNonNegativeInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? Math.floor(number) : null;
}

function normalizeGridTuple(value: unknown): NotebookAppGridTuple | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const horizontal = finiteNonNegativeInteger(value[0]);
  const vertical = finiteNonNegativeInteger(value[1]);
  if (horizontal === null || vertical === null) {
    return null;
  }

  return [horizontal, vertical];
}

function normalizeGridConfig(value: unknown): NotebookAppGridConfig {
  const grid = isRecord(value) ? value : {};
  const cols = finitePositiveInteger(grid.cols) ?? NOTEBOOK_APP_GRID_COLUMNS;
  const rowHeight =
    finitePositiveInteger(grid.rowHeight) ?? NOTEBOOK_APP_GRID_ROW_HEIGHT;

  return {
    cols,
    rowHeight,
    margin: normalizeGridTuple(grid.margin) ?? [0, 0],
    containerPadding: normalizeGridTuple(grid.containerPadding) ?? [0, 0],
  };
}

function normalizeLayoutItem(
  value: unknown,
  columns = NOTEBOOK_APP_GRID_COLUMNS,
): NotebookAppLayoutItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const w = finiteNumber(value.w);
  const h = finiteNumber(value.h);
  if (x === null || y === null || w === null || h === null) {
    return null;
  }

  const normalizedW = Math.min(columns, Math.max(1, Math.floor(w)));

  return {
    x: Math.min(columns - normalizedW, Math.max(0, Math.floor(x))),
    y: Math.max(0, Math.floor(y)),
    w: normalizedW,
    h: Math.max(1, Math.floor(h)),
  };
}

function layoutItemsOverlap(
  left: NotebookAppLayoutItem,
  right: NotebookAppLayoutItem,
): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

function findNextLayoutSlot(
  occupiedItems: NotebookAppLayoutItem[],
  item: Pick<NotebookAppLayoutItem, "w" | "h">,
  columns = NOTEBOOK_APP_GRID_COLUMNS,
): Pick<NotebookAppLayoutItem, "x" | "y"> {
  const width = Math.min(columns, Math.max(1, item.w));
  const bottom = occupiedItems.reduce(
    (maxY, occupied) => Math.max(maxY, occupied.y + occupied.h),
    0,
  );
  const candidateRows = Array.from(
    new Set([...occupiedItems.map((occupied) => occupied.y), bottom]),
  ).sort((a, b) => a - b);

  for (const y of candidateRows) {
    for (let x = 0; x <= columns - width; x++) {
      const candidate = { x, y, w: width, h: item.h };
      if (
        !occupiedItems.some((occupied) =>
          layoutItemsOverlap(candidate, occupied),
        )
      ) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: bottom };
}

function defaultLayoutSizeForCell(
  appCell: NotebookAppCell,
  columns = NOTEBOOK_APP_GRID_COLUMNS,
): Pick<NotebookAppLayoutItem, "w" | "h"> {
  const defaultWidth = Math.min(6, columns);

  if (appCell.kind === "cell" && appCell.cell.cell_type === CellType.MARKDOWN) {
    return { w: defaultWidth, h: 4 };
  }

  if (appCell.kind === "output") {
    return { w: defaultWidth, h: 8 };
  }

  return { w: defaultWidth, h: 5 };
}

export function getNotebookCellId(cell: NotebookCellType): string | null {
  const id = cell.metadata?.orion?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function getCellAppMetadata(
  cell: NotebookCellType,
): NotebookCellAppMetadata {
  const app = cell.metadata?.orion?.app;
  if (!isRecord(app)) {
    return {};
  }

  return {
    enabled: app.enabled === true,
    title: typeof app.title === "string" ? app.title : undefined,
    outputs: isRecord(app.outputs)
      ? Object.fromEntries(
          Object.entries(app.outputs).flatMap(([key, value]) => {
            if (!isRecord(value)) {
              return [];
            }
            return [
              [
                key,
                {
                  enabled: value.enabled === true,
                  title:
                    typeof value.title === "string" ? value.title : undefined,
                },
              ],
            ];
          }),
        )
      : undefined,
  };
}

export function isCellInAppView(cell: NotebookCellType): boolean {
  return getCellAppMetadata(cell).enabled === true;
}

export function isOutputInAppView(
  cell: NotebookCellType,
  outputIndex: number,
): boolean {
  return (
    getCellAppMetadata(cell).outputs?.[String(outputIndex)]?.enabled === true
  );
}

export function getCellAppTitle(
  cell: NotebookCellType,
  cellIndex: number,
): string {
  const title = getCellAppMetadata(cell).title?.trim();
  if (title) {
    return title;
  }

  return cell.cell_type === CellType.MARKDOWN
    ? `Markdown cell ${cellIndex}`
    : `Code cell ${cellIndex}`;
}

export function getOutputAppItemId(
  cellId: string,
  outputIndex: number,
): string {
  return `${cellId}:output:${outputIndex}`;
}

export function getOutputAppTitle(
  cell: NotebookCellType,
  cellIndex: number,
  outputIndex: number,
): string {
  const title =
    getCellAppMetadata(cell).outputs?.[String(outputIndex)]?.title?.trim();
  return title || `Cell ${cellIndex} output ${outputIndex}`;
}

export function withCellAppEnabled(
  cell: NotebookCellType,
  enabled: boolean,
): NotebookCellType {
  const metadata = cell.metadata ?? {};
  const orion = isRecord(metadata.orion) ? metadata.orion : {};
  const app = isRecord(orion.app) ? orion.app : {};

  return {
    ...cell,
    metadata: {
      ...metadata,
      orion: {
        ...orion,
        app: {
          ...app,
          enabled,
        },
      },
    },
  };
}

export function withOutputAppEnabled(
  cell: NotebookCellType,
  outputIndex: number,
  enabled: boolean,
): NotebookCellType {
  const metadata = cell.metadata ?? {};
  const orion = isRecord(metadata.orion) ? metadata.orion : {};
  const app = isRecord(orion.app) ? orion.app : {};
  const outputs = isRecord(app.outputs) ? app.outputs : {};
  const key = String(outputIndex);
  const outputApp = isRecord(outputs[key]) ? outputs[key] : {};

  return {
    ...cell,
    metadata: {
      ...metadata,
      orion: {
        ...orion,
        app: {
          ...app,
          outputs: {
            ...outputs,
            [key]: {
              ...outputApp,
              enabled,
            },
          },
        },
      },
    },
  };
}

export function getNotebookAppViewMetadata(
  metadata: NotebookType["metadata"] | undefined,
): NotebookAppViewMetadata {
  const orion = isRecord(metadata?.orion) ? metadata.orion : {};
  const appView = isRecord(orion.appView) ? orion.appView : {};
  const grid = normalizeGridConfig(appView.grid);
  const rawLayout = isRecord(appView.layout) ? appView.layout : {};
  const layout: Record<string, NotebookAppLayoutItem> = {};

  for (const [cellId, item] of Object.entries(rawLayout)) {
    const normalized = normalizeLayoutItem(item, grid.cols);
    if (normalized) {
      layout[cellId] = normalized;
    }
  }

  return {
    version: NOTEBOOK_APP_VIEW_VERSION,
    layout,
    grid,
  };
}

export function getAppViewCells(cells: NotebookCellType[]): NotebookAppCell[] {
  return cells.flatMap((cell, cellIndex) => {
    const cellId = getNotebookCellId(cell);
    if (!cellId) {
      return [];
    }

    const appCells: NotebookAppCell[] = [];

    if (isCellInAppView(cell) && cell.cell_type !== CellType.CODE) {
      appCells.push({
        cell,
        cellIndex,
        cellId,
        appItemId: cellId,
        kind: "cell",
        title: getCellAppTitle(cell, cellIndex),
      });
    }

    if (cell.cell_type === CellType.CODE && cell.outputs?.length) {
      const outputs = getCellAppMetadata(cell).outputs ?? {};
      for (
        let outputIndex = 0;
        outputIndex < cell.outputs.length;
        outputIndex++
      ) {
        if (outputs[String(outputIndex)]?.enabled !== true) {
          continue;
        }
        appCells.push({
          cell,
          cellIndex,
          cellId,
          appItemId: getOutputAppItemId(cellId, outputIndex),
          kind: "output",
          outputIndex,
          title: getOutputAppTitle(cell, cellIndex, outputIndex),
        });
      }
    }

    return appCells;
  });
}

export function ensureAppViewLayout(
  cells: NotebookCellType[],
  appView: NotebookAppViewMetadata,
): NotebookAppViewMetadata {
  const layout = { ...appView.layout };
  const occupiedItems: NotebookAppLayoutItem[] = Object.values(layout);

  for (const appCell of getAppViewCells(cells)) {
    if (layout[appCell.appItemId]) {
      continue;
    }

    const size = defaultLayoutSizeForCell(appCell, appView.grid.cols);
    const position = findNextLayoutSlot(occupiedItems, size, appView.grid.cols);
    const item = { ...position, ...size };
    layout[appCell.appItemId] = item;
    occupiedItems.push(item);
  }

  return {
    version: NOTEBOOK_APP_VIEW_VERSION,
    layout,
    grid: appView.grid,
  };
}

export function toReactGridLayout(
  appCells: NotebookAppCell[],
  appView: NotebookAppViewMetadata,
): ReactGridLayoutItem[] {
  const defaultWidth = Math.min(6, appView.grid.cols);

  return appCells.map((appCell) => ({
    i: appCell.appItemId,
    ...(appView.layout[appCell.appItemId] ?? {
      x: 0,
      y: 0,
      w: defaultWidth,
      h: 5,
    }),
  }));
}

export function mergeReactGridLayout(
  currentLayout: Record<string, NotebookAppLayoutItem>,
  nextLayout: readonly ReactGridLayoutItem[],
  columns = NOTEBOOK_APP_GRID_COLUMNS,
): Record<string, NotebookAppLayoutItem> {
  const merged = { ...currentLayout };

  for (const item of nextLayout) {
    const normalized = normalizeLayoutItem(item, columns);
    if (normalized) {
      merged[item.i] = normalized;
    }
  }

  return merged;
}

export function withNotebookAppViewMetadata(
  notebook: NotebookType,
  appView: NotebookAppViewMetadata,
): NotebookType {
  const metadata = notebook.metadata ?? {};
  const orion = isRecord(metadata.orion) ? metadata.orion : {};

  return {
    ...notebook,
    metadata: {
      ...metadata,
      orion: {
        ...orion,
        appView,
      },
    },
  };
}
