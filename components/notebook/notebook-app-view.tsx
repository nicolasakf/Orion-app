"use client";

import React, { useCallback, useMemo } from "react";
import ReactGridLayout, {
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
import { AlertTriangle, GripVertical, LayoutTemplate, X } from "lucide-react";

import { NotebookAppSchemaView } from "@/components/notebook/notebook-app-schema-view";
import type { OrionUiLocalValue } from "@/components/notebook/orion-ui-primitives";
import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import { OutputRenderer } from "@/components/notebook/output-renderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ensureAppViewLayout,
  getAppViewCells,
  getNotebookAppViewMetadata,
  mergeReactGridLayout,
  parseNotebookAppViewSchema,
  toReactGridLayout,
  type NotebookAppCell,
  type NotebookAppViewMetadata,
} from "@/lib/notebook/app-view";
import { cn } from "@/lib/utils";
import { CellType, type NotebookType } from "@/lib/types";

interface NotebookAppViewProps {
  notebook: NotebookType;
  onAppViewChange: (appView: NotebookAppViewMetadata) => void;
  onRemoveAppItem: (appCell: NotebookAppCell) => void;
  onNotebookViewRequest?: () => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
}

function sourceToString(source: string[] | undefined): string {
  return Array.isArray(source) ? source.join("") : "";
}

function layoutItemsEqual(
  left: Record<string, { x: number; y: number; w: number; h: number }>,
  right: Record<string, { x: number; y: number; w: number; h: number }>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) {
      return false;
    }
    const a = left[key];
    const b = right[key];
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  });
}

function AppViewSchemaError({
  errors,
  onNotebookViewRequest,
}: {
  errors: string[];
  onNotebookViewRequest?: () => void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-xl p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">
              App View schema could not be rendered
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {errors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
            {onNotebookViewRequest ? (
              <Button
                type="button"
                variant="link"
                className="mt-4 h-auto p-0 text-sm"
                onClick={onNotebookViewRequest}
              >
                Back to Notebook View
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Renders notebook cells marked for App View as a manually editable dashboard grid.
 */
export function NotebookAppView({
  notebook,
  onAppViewChange,
  onRemoveAppItem,
  onNotebookViewRequest,
  onOrionUiStateChange,
  onOrionUiAction,
}: NotebookAppViewProps): React.JSX.Element {
  const { width, containerRef, mounted } = useContainerWidth();
  const schemaResult = useMemo(
    () => parseNotebookAppViewSchema(notebook.metadata),
    [notebook.metadata],
  );
  const appCells = useMemo(
    () => getAppViewCells(notebook.cells),
    [notebook.cells],
  );
  const appView = useMemo(
    () =>
      ensureAppViewLayout(
        notebook.cells,
        getNotebookAppViewMetadata(notebook.metadata),
      ),
    [notebook.cells, notebook.metadata],
  );
  const layout = useMemo(
    () => toReactGridLayout(appCells, appView),
    [appCells, appView],
  );

  const handleLayoutChange = useCallback(
    (nextLayout: Layout) => {
      const mergedLayout = mergeReactGridLayout(
        appView.layout,
        nextLayout,
        appView.grid.cols,
      );
      if (layoutItemsEqual(appView.layout, mergedLayout)) {
        return;
      }
      onAppViewChange({
        version: appView.version,
        layout: mergedLayout,
        grid: appView.grid,
      });
    },
    [appView, onAppViewChange],
  );

  if (schemaResult.status === "valid") {
    return (
      <NotebookAppSchemaView
        notebook={notebook}
        schema={schemaResult.schema}
        onOrionUiStateChange={onOrionUiStateChange}
        onOrionUiAction={onOrionUiAction}
      />
    );
  }

  if (schemaResult.status === "invalid") {
    return (
      <AppViewSchemaError
        errors={schemaResult.errors}
        onNotebookViewRequest={onNotebookViewRequest}
      />
    );
  }

  if (appCells.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <LayoutTemplate className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-medium text-foreground mt-2">
            No cells in App View
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            From Notebook view, right-click a cell or output and choose
          </p>
          <div
            className={cn(
              "corner-squircle mx-auto mt-3 w-fit",
              "bg-popover text-popover-foreground rounded-md border p-1 shadow-md",
            )}
          >
            <div
              className={cn(
                "corner-squircle relative flex cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-hidden",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                "[&_svg:not([class*='text-'])]:text-muted-foreground",
              )}
            >
              <LayoutTemplate className="mr-2 h-4 w-4" />
              Add to App View
            </div>
          </div>
          {onNotebookViewRequest ? (
            <Button
              type="button"
              variant="link"
              className="mt-2 h-auto p-0 text-sm"
              onClick={onNotebookViewRequest}
            >
              Back to Notebook View
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 p-3" data-notebook-export-root="app">
      <div
        ref={containerRef}
        className="notebook-app-grid min-h-full"
        style={
          {
            "--notebook-app-grid-column-width":
              mounted && width > 0
                ? `${width / appView.grid.cols}px`
                : undefined,
            "--notebook-app-grid-row-height": `${appView.grid.rowHeight}px`,
          } as React.CSSProperties
        }
      >
        {mounted ? (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{
              cols: appView.grid.cols,
              rowHeight: appView.grid.rowHeight,
              margin: appView.grid.margin,
              containerPadding: appView.grid.containerPadding,
            }}
            dragConfig={{
              handle: ".notebook-app-card-drag-handle",
              cancel: ".notebook-app-card-content, .notebook-app-card-remove",
            }}
            resizeConfig={{
              handles: ["se"],
            }}
            onLayoutChange={handleLayoutChange}
          >
            {appCells.map((appCell) => {
              const isOutputHidden =
                appCell.cell.metadata?.orion?.cellState?.isOutputHidden ===
                true;
              const output =
                appCell.kind === "output" && appCell.outputIndex !== undefined
                  ? appCell.cell.outputs?.[appCell.outputIndex]
                  : undefined;
              const isSingleOutputHidden =
                output?.metadata?.orion?.hidden === true;

              return (
                <div key={appCell.appItemId} className="h-full">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <Card
                        className={cn(
                          "group relative h-full overflow-hidden rounded-lg",
                          appCell.cell.cell_type === CellType.MARKDOWN
                            ? "border-0 bg-sidebar shadow-none"
                            : "border bg-background shadow-sm",
                        )}
                      >
                        <div className="notebook-app-card-drag-handle pointer-events-none absolute inset-x-0 top-0 z-20 flex h-8 cursor-move items-center gap-2 border-b bg-muted/85 px-2 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                            {appCell.title}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="notebook-app-card-remove h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Remove from App View"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRemoveAppItem(appCell);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div
                          className={cn(
                            "notebook-app-card-content h-full overflow-auto",
                            appCell.cell.cell_type === CellType.MARKDOWN &&
                            "p-3",
                          )}
                        >
                          {appCell.cell.cell_type === CellType.MARKDOWN ? (
                            <MarkdownRenderer
                              source={sourceToString(appCell.cell.source)}
                            />
                          ) : isOutputHidden ? (
                            <div className="p-3 text-sm text-muted-foreground">
                              Output hidden in notebook.
                            </div>
                          ) : isSingleOutputHidden ? (
                            <div className="p-3 text-sm text-muted-foreground">
                              This output is hidden in notebook.
                            </div>
                          ) : output ? (
                            <OutputRenderer
                              output={output}
                              notebookMetadata={notebook.metadata}
                              cellIndex={appCell.cellIndex}
                              outputIndex={appCell.outputIndex ?? 0}
                              onOrionUiStateChange={onOrionUiStateChange}
                              onOrionUiAction={onOrionUiAction}
                            />
                          ) : (
                            <div className="p-3 text-sm text-muted-foreground">
                              No output selected. Add an output from Notebook
                              view.
                            </div>
                          )}
                        </div>
                      </Card>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextMenuItem onClick={() => onRemoveAppItem(appCell)}>
                        <X className="mr-2 h-4 w-4" />
                        Remove from App View
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })}
          </ReactGridLayout>
        ) : null}
      </div>
    </div>
  );
}
