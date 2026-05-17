import {
  CellType,
  type NotebookCellType,
  type NotebookType,
} from "@/lib/types";

export const NOTEBOOK_APP_VIEW_VERSION = 1;
export const NOTEBOOK_APP_GRID_COLUMNS = 24;
export const NOTEBOOK_APP_GRID_ROW_HEIGHT = 44;

export type NotebookAppGridTuple = [number, number];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
