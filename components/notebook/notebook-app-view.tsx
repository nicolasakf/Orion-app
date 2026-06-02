"use client";

import React, { useMemo } from "react";
import { LayoutTemplate, Sparkles } from "lucide-react";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import type { OrionUiLocalValue } from "@/components/notebook/orion-ui-primitives";
import { OutputRenderer } from "@/components/notebook/output-renderer";
import { Button } from "@/components/ui/button";
import {
  isNotebookCellInAppView,
  isNotebookOutputInAppView,
} from "@/lib/notebook/app-view";
import { dispatchInsertChatSkill } from "@/lib/chat/chat-composer-events";
import { cn } from "@/lib/utils";
import {
  CellType,
  type NotebookCellType,
  type NotebookOutputType,
  type NotebookType,
} from "@/lib/types";

interface NotebookAppViewProps {
  notebook: NotebookType;
  onNotebookViewRequest?: () => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
}

type NotebookAppViewItem =
  | {
    kind: "markdown";
    cell: NotebookCellType;
    cellIndex: number;
  }
  | {
    kind: "output";
    output: NotebookOutputType;
    cellIndex: number;
    outputIndex: number;
  };

/** Extracts notebook cell source as a single markdown string. */
function sourceToString(source: string[] | undefined): string {
  return Array.isArray(source) ? source.join("") : "";
}

/** Collects App View items in notebook source order. */
function getNotebookAppViewItems(
  notebook: NotebookType,
): NotebookAppViewItem[] {
  return notebook.cells.flatMap<NotebookAppViewItem>((cell, cellIndex) => {
    if (cell.cell_type === CellType.MARKDOWN) {
      return isNotebookCellInAppView(cell)
        ? [{ kind: "markdown" as const, cell, cellIndex }]
        : [];
    }

    if (cell.cell_type !== CellType.CODE || !cell.outputs?.length) {
      return [];
    }

    return cell.outputs.flatMap((output, outputIndex) =>
      isNotebookOutputInAppView(cell, outputIndex)
        ? [
          {
            kind: "output" as const,
            output,
            cellIndex,
            outputIndex,
          },
        ]
        : [],
    );
  });
}

/**
 * Renders notebook cells and outputs explicitly marked for App View.
 */
export function NotebookAppView({
  notebook,
  onNotebookViewRequest,
  onOrionUiStateChange,
  onOrionUiAction,
}: NotebookAppViewProps): React.JSX.Element {
  const appViewItems = useMemo(
    () => getNotebookAppViewItems(notebook),
    [notebook],
  );

  if (appViewItems.length > 0) {
    return (
      <div
        className="orion-app-view min-h-0 flex-1 overflow-y-auto bg-sidebar"
        data-notebook-export-root="app"
      >
        <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 p-4">
          {appViewItems.map((item) =>
            item.kind === "markdown" ? (
              <div
                key={`markdown-${item.cellIndex}`}
                className="jp-Cell jp-MarkdownCell"
              >
                <MarkdownRenderer source={sourceToString(item.cell.source)} />
              </div>
            ) : (
              <div
                key={`output-${item.cellIndex}-${item.outputIndex}`}
                className="jp-Cell jp-CodeCell"
              >
                <OutputRenderer
                  output={item.output}
                  notebookMetadata={notebook.metadata}
                  cellIndex={item.cellIndex}
                  outputIndex={item.outputIndex}
                  onOrionUiStateChange={(key, value, outputId) =>
                    onOrionUiStateChange?.(key, value, outputId)
                  }
                  onOrionUiAction={onOrionUiAction}
                />
              </div>
            ),
          )}
        </main>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center p-6"
      data-notebook-export-root="app"
    >
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <LayoutTemplate className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-medium text-foreground mt-2">
          No cells in App View yet
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => dispatchInsertChatSkill("create-app")}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Use Create App skill
        </Button>
        <div
          className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground"
          aria-hidden
        >
          <div className="h-px flex-1 bg-border" />
          <span>Or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <p className="text-sm text-muted-foreground">
          In Notebook view, right-click a cell or output, then choose
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
            className="mt-3 h-auto p-0 text-sm"
            onClick={onNotebookViewRequest}
          >
            Back to Notebook View
          </Button>
        ) : null}
      </div>
    </div>
  );
}
