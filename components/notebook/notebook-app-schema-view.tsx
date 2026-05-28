"use client";

import React, { useMemo } from "react";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import { OrionUiPrimitiveTree } from "@/components/notebook/orion-ui-primitives";
import type {
  OrionUiLocalValue,
  OrionUiRenderCallbacks,
} from "@/components/notebook/orion-ui-primitives";
import { OutputRenderer } from "@/components/notebook/output-renderer";
import {
  getNotebookCellId,
  type NotebookAppViewSchema,
} from "@/lib/notebook/app-view";
import { CellType, type NotebookCellType, type NotebookType } from "@/lib/types";

interface NotebookAppSchemaViewProps {
  notebook: NotebookType;
  schema: NotebookAppViewSchema;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
}

const APP_VIEW_ROOT_CLASS = "orion-app-view";

/** Builds a lookup table for stable cell id references. */
function getCellsById(
  cells: NotebookCellType[],
): Map<string, { cell: NotebookCellType; cellIndex: number }> {
  const entries = cells.flatMap((cell, cellIndex) => {
    const cellId = getNotebookCellId(cell);
    return cellId ? [[cellId, { cell, cellIndex }] as const] : [];
  });

  return new Map(entries);
}

/** Extracts notebook cell source as a single markdown string. */
function sourceToString(source: string[] | undefined): string {
  return Array.isArray(source) ? source.join("") : "";
}

/** Renders a declarative App View schema using Orion's shared primitive registry. */
export function NotebookAppSchemaView({
  notebook,
  schema,
  onOrionUiStateChange,
  onOrionUiAction,
}: NotebookAppSchemaViewProps): React.JSX.Element {
  const cellsById = useMemo(
    () => getCellsById(notebook.cells),
    [notebook.cells],
  );

  const callbacks = useMemo<OrionUiRenderCallbacks>(
    () => ({
      onStateChange: (key, value) => onOrionUiStateChange?.(key, value),
      onAction: onOrionUiAction,
      renderMarkdownReference: (cellId, fallbackSource) => {
        const entry = cellId ? cellsById.get(cellId) : undefined;
        const source =
          fallbackSource ??
          (entry?.cell.cell_type === CellType.MARKDOWN
            ? sourceToString(entry.cell.source)
            : undefined);

        return source ? <MarkdownRenderer source={source} /> : undefined;
      },
      renderOutputReference: (cellId, outputIndex) => {
        const entry = cellId ? cellsById.get(cellId) : undefined;
        const output = entry?.cell.outputs?.[outputIndex];

        return output && entry ? (
          <OutputRenderer
            output={output}
            notebookMetadata={notebook.metadata}
            cellIndex={entry.cellIndex}
            outputIndex={outputIndex}
            onOrionUiStateChange={(key, value, outputId) =>
              onOrionUiStateChange?.(key, value, outputId)
            }
            onOrionUiAction={onOrionUiAction}
          />
        ) : undefined;
      },
    }),
    [
      cellsById,
      notebook.metadata,
      onOrionUiAction,
      onOrionUiStateChange,
    ],
  );

  return (
    <div
      className={`${APP_VIEW_ROOT_CLASS} min-h-0 flex-1 overflow-y-auto bg-sidebar`}
      data-notebook-export-root="app"
    >
      <OrionUiPrimitiveTree root={schema.root} callbacks={callbacks} />
    </div>
  );
}
