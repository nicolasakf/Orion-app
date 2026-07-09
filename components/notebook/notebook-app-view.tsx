"use client";

import React, { useMemo } from "react";
import { LayoutTemplate, Sparkles } from "lucide-react";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import type { OrionUiLocalValue } from "@/components/notebook/orion-ui-primitives";
import type {
  OrionTableCommResponse,
  OrionTableOutputMetadata,
  OrionTableRequest,
} from "@/components/notebook/orion-ui-table/types";
import { OutputRenderer } from "@/components/notebook/output-renderer";
import { QueuedOutputSkeleton } from "@/components/notebook/queued-output-skeleton";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  isNotebookCellInAppView,
  isNotebookOutputInAppView,
  type NotebookAppViewReference,
} from "@/lib/notebook/app-view";
import { dispatchInsertChatSkill } from "@/lib/chat/chat-composer-events";
import { cn } from "@/lib/utils";
import {
  CellExecutionStatus,
  CellType,
  type NotebookCellType,
  type NotebookOutputType,
  type NotebookType,
} from "@/lib/types";

interface NotebookAppViewProps {
  notebook: NotebookType;
  notebookPath?: string;
  /** Shows the business-mode empty state when App View has no selected cells. */
  businessMode?: boolean;
  onNotebookViewRequest?: () => void;
  onRemoveAppViewReference?: (reference: NotebookAppViewReference) => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
  onOrionUiTableRequest?: (
    request: OrionTableRequest,
  ) => Promise<OrionTableCommResponse>;
  onOrionUiTableMetadataChange?: (
    cellIndex: number,
    outputIndex: number,
    metadata: OrionTableOutputMetadata,
  ) => void;
}

type NotebookAppViewItem =
  | {
    kind: "markdown";
    cell: NotebookCellType;
    cellIndex: number;
  }
  | {
    kind: "output";
    cell: NotebookCellType;
    output: NotebookOutputType;
    cellIndex: number;
    outputIndex: number;
  };

interface NotebookAppViewItemOptions {
  /** Includes markdown cells with source even when not selected for App View. */
  includeAllMarkdown?: boolean;
  /** Includes every code-cell output, regardless of App View metadata. */
  includeAllOutputs?: boolean;
}

/** Extracts notebook cell source as a single markdown string. */
function sourceToString(source: string[] | undefined): string {
  return Array.isArray(source) ? source.join("") : "";
}

/** Collects App View items in notebook source order. */
function getNotebookAppViewItems(
  notebook: NotebookType,
  options: NotebookAppViewItemOptions = {},
): NotebookAppViewItem[] {
  const { includeAllMarkdown = false, includeAllOutputs = false } = options;

  return notebook.cells.flatMap<NotebookAppViewItem>((cell, cellIndex) => {
    if (cell.cell_type === CellType.MARKDOWN) {
      return isNotebookCellInAppView(cell) ||
        (includeAllMarkdown && sourceToString(cell.source).trim().length > 0)
        ? [{ kind: "markdown" as const, cell, cellIndex }]
        : [];
    }

    if (cell.cell_type !== CellType.CODE || !cell.outputs?.length) {
      return [];
    }

    return cell.outputs.flatMap((output, outputIndex) =>
      includeAllOutputs || isNotebookOutputInAppView(cell, outputIndex)
        ? [
          {
            kind: "output" as const,
            cell,
            output,
            cellIndex,
            outputIndex,
          },
        ]
        : [],
    );
  });
}

/** Returns true when the notebook has any user-visible source or output content. */
function notebookHasContent(notebook: NotebookType): boolean {
  return notebook.cells.some((cell) => {
    const hasSource = sourceToString(cell.source).trim().length > 0;
    const hasOutputs =
      cell.cell_type === CellType.CODE && Boolean(cell.outputs?.length);
    return hasSource || hasOutputs;
  });
}

interface AppViewMarkdownContextMenuProps {
  children: React.ReactNode;
  onRemove?: () => void;
}

/** Context menu for markdown items rendered inside App View. */
function AppViewMarkdownContextMenu({
  children,
  onRemove,
}: AppViewMarkdownContextMenuProps): React.JSX.Element {
  if (!onRemove) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onRemove}>
          <LayoutTemplate className="mr-2 h-4 w-4 !text-[#ff4800]" />
          Remove from App View
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Empty notebook message shown in business-mode App View. */
function BusinessEmptyNotebookState(): React.JSX.Element {
  return (
    <div
      className="flex min-h-full flex-1 items-center justify-center overflow-y-auto p-6"
      data-notebook-export-root="app"
    >
      <div className="mx-auto max-w-sm text-center">
        <h3 className="text-2xl font-semibold text-foreground">
          This file is empty
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Use the chat to ask Orion to start working on it.
        </p>
      </div>
    </div>
  );
}

/** Business-mode fallback when a notebook has content but no renderable items. */
function BusinessNoAppViewContentState(): React.JSX.Element {
  return (
    <div
      className="flex min-h-full flex-1 items-center justify-center overflow-y-auto p-6"
      data-notebook-export-root="app"
    >
      <div className="mx-auto max-w-sm text-center">
        <h3 className="text-lg font-medium text-foreground">No outputs yet</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Use the chat to run or build something for this file.
        </p>
      </div>
    </div>
  );
}

/**
 * Renders notebook cells and outputs explicitly marked for App View.
 */
export function NotebookAppView({
  notebook,
  notebookPath,
  businessMode = false,
  onNotebookViewRequest,
  onRemoveAppViewReference,
  onOrionUiStateChange,
  onOrionUiAction,
  onOrionUiTableRequest,
  onOrionUiTableMetadataChange,
}: NotebookAppViewProps): React.JSX.Element {
  const appViewItems = useMemo(
    () => getNotebookAppViewItems(notebook),
    [notebook],
  );
  const hasContent = useMemo(() => notebookHasContent(notebook), [notebook]);
  const displayItems = useMemo(
    () =>
      businessMode && appViewItems.length === 0 && hasContent
        ? getNotebookAppViewItems(notebook, {
          includeAllMarkdown: true,
          includeAllOutputs: true,
        })
        : appViewItems,
    [appViewItems, businessMode, hasContent, notebook],
  );

  /** Requests that the chat composer attach the selected App View output. */
  const handleMentionOutput = React.useCallback(
    (cellIndex: number, outputIndex: number) => {
      if (!notebookPath) return;

      const output = notebook.cells[cellIndex]?.outputs?.[outputIndex];
      window.dispatchEvent(
        new CustomEvent("orion:mention-notebook-output", {
          detail: {
            notebookPath,
            cellIndex,
            outputIndex,
            preview: output
              ? `Notebook cell ${cellIndex}, output ${outputIndex} (${output.output_type}).`
              : `Notebook cell ${cellIndex}, output ${outputIndex}.`,
          },
        }),
      );
    },
    [notebook.cells, notebookPath],
  );

  /** Removes an output from App View through the editor-owned metadata path. */
  const handleRemoveOutput = React.useCallback(
    (cellIndex: number, outputIndex: number) => {
      onRemoveAppViewReference?.({
        kind: "output",
        cellIndex,
        outputIndex,
      });
    },
    [onRemoveAppViewReference],
  );

  if (displayItems.length > 0) {
    return (
      <div
        className="orion-app-view min-h-0 flex-1 overflow-y-auto bg-sidebar"
        data-notebook-export-root="app"
      >
        <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 p-4">
          {displayItems.map((item) =>
            item.kind === "markdown" ? (
              <AppViewMarkdownContextMenu
                key={`markdown-${item.cellIndex}`}
                onRemove={
                  onRemoveAppViewReference
                    ? () =>
                        onRemoveAppViewReference({
                          kind: "markdown",
                          cellIndex: item.cellIndex,
                        })
                    : undefined
                }
              >
                <div className="jp-Cell jp-MarkdownCell">
                  <MarkdownRenderer source={sourceToString(item.cell.source)} />
                </div>
              </AppViewMarkdownContextMenu>
            ) : (
              <div
                key={`output-${item.cellIndex}-${item.outputIndex}`}
                className="jp-Cell jp-CodeCell"
              >
                {item.cell.metadata?.orion?.cellState?.executionInfo
                  ?.status === CellExecutionStatus.QUEUED ? (
                  <QueuedOutputSkeleton />
                ) : (
                  <OutputRenderer
                    output={item.output}
                    notebookMetadata={notebook.metadata}
                    cellIndex={item.cellIndex}
                    outputIndex={item.outputIndex}
                    onMentionOutput={
                      notebookPath ? handleMentionOutput : undefined
                    }
                    onToggleOutputAppView={
                      onRemoveAppViewReference ? handleRemoveOutput : undefined
                    }
                    isInAppView
                    onOrionUiStateChange={(key, value, outputId) =>
                      onOrionUiStateChange?.(key, value, outputId)
                    }
                    onOrionUiAction={onOrionUiAction}
                    onOrionUiTableRequest={onOrionUiTableRequest}
                    onOrionUiTableMetadataChange={
                      onOrionUiTableMetadataChange
                    }
                  />
                )}
              </div>
            ),
          )}
        </main>
      </div>
    );
  }

  if (businessMode) {
    return hasContent ? (
      <BusinessNoAppViewContentState />
    ) : (
      <BusinessEmptyNotebookState />
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
