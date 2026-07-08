"use client";

import React, { useMemo } from "react";
import { BookOpen, LayoutTemplate, Sparkles } from "lucide-react";

import {
  BUSINESS_APP_PROMPT_CATEGORIES,
  FEATURED_BUSINESS_APP_PROMPTS,
  type BusinessAppPromptSuggestion,
} from "@/components/notebook/business-app-prompt-library";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  isNotebookCellInAppView,
  isNotebookOutputInAppView,
  type NotebookAppViewReference,
} from "@/lib/notebook/app-view";
import {
  dispatchInsertChatMessage,
  dispatchInsertChatSkill,
} from "@/lib/chat/chat-composer-events";
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

interface BusinessPromptButtonProps {
  suggestion: BusinessAppPromptSuggestion;
  onSelect: (prompt: string) => void;
}

/** Clickable prompt card that inserts its prompt into the chat composer. */
function BusinessPromptButton({
  suggestion,
  onSelect,
}: BusinessPromptButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={`Use prompt suggestion: ${suggestion.title}`}
      className={cn(
        "corner-squircle flex min-h-32 w-full items-start gap-3 rounded-md border border-border/70 bg-background/85 px-4 py-3 text-left shadow-sm",
        "transition-colors hover:border-primary/50 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      onClick={() => onSelect(suggestion.prompt)}
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-snug text-foreground">
          {suggestion.title}
        </span>
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
          {suggestion.prompt}
        </span>
      </span>
    </button>
  );
}

interface BusinessPromptCatalogDialogProps {
  onSelectPrompt: (prompt: string) => void;
}

/** Full data-analysis prompt catalog grouped by analysis category. */
function BusinessPromptCatalogDialog({
  onSelectPrompt,
}: BusinessPromptCatalogDialogProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  const handleSelectPrompt = React.useCallback(
    (prompt: string) => {
      onSelectPrompt(prompt);
      setOpen(false);
    },
    [onSelectPrompt],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="mt-5">
          <BookOpen className="mr-2 h-4 w-4" />
          Browse prompt library
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Prompt Library</DialogTitle>
        </DialogHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto pr-2"
          data-prompt-catalog-scroll
        >
          <div className="grid gap-6 pb-1">
            {BUSINESS_APP_PROMPT_CATEGORIES.map((group) => (
              <section key={group.category} className="text-left">
                <h4 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.category}
                </h4>
                <div
                  aria-label={`${group.category} prompt suggestions`}
                  className="grid gap-3 md:grid-cols-2"
                >
                  {group.suggestions.map((suggestion) => (
                    <BusinessPromptButton
                      key={suggestion.title}
                      suggestion={suggestion}
                      onSelect={handleSelectPrompt}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Featured business-mode prompt suggestions for an empty App View. */
function BusinessAppViewPromptCarousel(): React.JSX.Element {
  const handleSelectPrompt = React.useCallback((prompt: string) => {
    dispatchInsertChatMessage(prompt);
  }, []);

  return (
    <div
      className="flex min-h-full flex-1 items-center justify-center overflow-y-auto p-6"
      data-notebook-export-root="app"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center py-4 text-center">
        <h3 className="text-2xl font-semibold text-foreground">
          What should Orion work on?
        </h3>
        <div
          aria-label="Featured prompt suggestions"
          className="mt-6 grid w-full gap-3 md:grid-cols-2"
        >
          {FEATURED_BUSINESS_APP_PROMPTS.map((suggestion) => (
            <BusinessPromptButton
              key={suggestion.title}
              suggestion={suggestion}
              onSelect={handleSelectPrompt}
            />
          ))}
        </div>
        <BusinessPromptCatalogDialog onSelectPrompt={handleSelectPrompt} />
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

  if (appViewItems.length > 0) {
    return (
      <div
        className="orion-app-view min-h-0 flex-1 overflow-y-auto bg-sidebar"
        data-notebook-export-root="app"
      >
        <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 p-4">
          {appViewItems.map((item) =>
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
    return <BusinessAppViewPromptCarousel />;
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
