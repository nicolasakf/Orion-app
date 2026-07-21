"use client";

import React, { useMemo } from "react";
import {
  AtSign,
  LayoutTemplate,
  Sparkles,
  X,
} from "lucide-react";

import { BusinessRichMarkdownEditor } from "@/components/notebook/business-rich-markdown-editor";
import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import type {
  OrionUiLocalValue,
  OrionUiStateChangeContext,
} from "@/components/notebook/orion-ui-primitives";
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
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  isNotebookCellInAppView,
  isNotebookOutputInAppView,
  type NotebookAppViewReference,
} from "@/lib/notebook/app-view";
import {
  buildNotebookMinimap,
  type NotebookMinimapSection,
} from "@/components/notebook/notebook-minimap";
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
  /** Enables direct App View cell interactions from the Business shell's Edit toggle. */
  businessEditMode?: boolean;
  /** Enables App View-specific keyboard shortcuts while the view is visible. */
  undoRemovalEnabled?: boolean;
  /** Saves a Business-mode markdown edit and resolves only after it is persisted. */
  onSaveMarkdownCell?: (cellIndex: number, source: string) => Promise<void>;
  onNotebookViewRequest?: () => void;
  onRemoveAppViewReference?: (reference: NotebookAppViewReference) => void;
  onRestoreAppViewReference?: (reference: NotebookAppViewReference) => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
    change?: OrionUiStateChangeContext,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
  onOrionUiUnmount?: (outputId?: string) => void;
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

interface NotebookTocItem {
  id: string;
  title: string;
  level: number;
  cellIndex: number;
}

/** Extracts notebook cell source as a single markdown string. */
function sourceToString(source: string[] | undefined): string {
  return Array.isArray(source) ? source.join("") : "";
}

/** Returns true when keyboard input belongs to a text-editing control. */
function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ),
  );
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

/** Flattens the notebook minimap tree into heading-only TOC rows. */
function flattenNotebookTocSections(
  sections: NotebookMinimapSection[],
  visibleCellIndices: Set<number>,
): NotebookTocItem[] {
  const items: NotebookTocItem[] = [];

  const visit = (section: NotebookMinimapSection) => {
    if (
      section.headingText !== null &&
      section.headingCellIndex !== null &&
      visibleCellIndices.has(section.headingCellIndex)
    ) {
      items.push({
        id: section.id,
        title: section.headingText,
        level: section.headingLevel,
        cellIndex: section.headingCellIndex,
      });
    }

    section.children.forEach(visit);
  };

  sections.forEach(visit);
  return items;
}

/** Compact business App View-only table-of-contents rail with one full contents card. */
function NotebookAppViewTocRail({
  items,
  onNavigate,
}: {
  items: NotebookTocItem[];
  onNavigate: (cellIndex: number) => void;
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="scrollbar-hide group flex max-h-[70vh] w-8 flex-col items-start gap-2 overflow-y-auto px-1 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Browse table of contents"
        >
          {items.map((item) => (
            <span
              key={item.id}
              className={cn(
                "h-0.5 rounded-full bg-muted-foreground/35 transition-colors group-hover:bg-muted-foreground/60",
                item.level <= 1 ? "w-5" : item.level === 2 ? "w-4" : "w-3",
              )}
            />
          ))}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="center"
        sideOffset={6}
        className="max-h-96 w-80 overflow-y-auto p-2"
      >
        <nav aria-label="App View table of contents">
          <div className="space-y-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-center rounded-sm py-1.5 pr-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                aria-label={`Go to ${item.title}`}
                onClick={() => onNavigate(item.cellIndex)}
              >
                <span className="truncate">{item.title}</span>
              </button>
            ))}
          </div>
        </nav>
      </HoverCardContent>
    </HoverCard>
  );
}

interface AppViewMarkdownContextMenuProps {
  children: React.ReactNode;
  onMention?: () => void;
  onRemove?: () => void;
  businessMode?: boolean;
  /** Leaves interactive rich-editor controls free of the surrounding menu. */
  disabled?: boolean;
}

/** Context menu for markdown items rendered inside App View. */
function AppViewMarkdownContextMenu({
  children,
  onMention,
  onRemove,
  businessMode = false,
  disabled = false,
}: AppViewMarkdownContextMenuProps): React.JSX.Element {
  if (disabled || (!onMention && !onRemove)) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {onMention ? (
          <ContextMenuItem onClick={onMention}>
            <AtSign className="mr-2 h-4 w-4" />
            {businessMode ? "Mention in chat" : "Mention cell in chat"}
          </ContextMenuItem>
        ) : null}
        {onMention && onRemove ? <ContextMenuSeparator /> : null}
        {onRemove ? (
          <ContextMenuItem onClick={onRemove}>
            {businessMode ? (
              <X className="mr-2 h-4 w-4" />
            ) : (
              <LayoutTemplate className="mr-2 h-4 w-4 !text-[#ff4800]" />
            )}
            {businessMode ? "Remove" : "Remove from App View"}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface BusinessMarkdownCellProps {
  cellIndex: number;
  source: string;
  isEditMode: boolean;
  isEditing: boolean;
  canStartEditing: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onFinishEditing: () => void;
  onSave: (source: string) => Promise<void>;
}

/** Renders a Business-mode markdown block with a guarded rich editing lifecycle. */
function BusinessMarkdownCell({
  cellIndex,
  source,
  isEditMode,
  isEditing,
  canStartEditing,
  onStartEditing,
  onCancelEditing,
  onFinishEditing,
  onSave,
}: BusinessMarkdownCellProps): React.JSX.Element {
  /** Starts editing a markdown block only while the Business Edit mode is active. */
  const handleMarkdownClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isEditMode || isEditing || !canStartEditing) return;

      event.preventDefault();
      event.stopPropagation();
      onStartEditing();
    },
    [canStartEditing, isEditMode, isEditing, onStartEditing],
  );

  if (isEditing) {
    return (
      <BusinessRichMarkdownEditor
        cellIndex={cellIndex}
        source={source}
        onSave={onSave}
        onCancel={onCancelEditing}
        onFinishEditing={onFinishEditing}
      />
    );
  }

  return (
    <div
      className={cn(
        "jp-Cell jp-MarkdownCell",
        isEditMode && canStartEditing &&
          "cursor-text transition-opacity hover:opacity-50",
      )}
      data-app-view-cell-index={cellIndex}
      onClickCapture={handleMarkdownClick}
    >
      <MarkdownRenderer source={source} />
    </div>
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
  businessEditMode = false,
  undoRemovalEnabled = false,
  onSaveMarkdownCell,
  onNotebookViewRequest,
  onRemoveAppViewReference,
  onRestoreAppViewReference,
  onOrionUiStateChange,
  onOrionUiAction,
  onOrionUiUnmount,
  onOrionUiTableRequest,
  onOrionUiTableMetadataChange,
}: NotebookAppViewProps): React.JSX.Element {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [editingMarkdownCellIndex, setEditingMarkdownCellIndex] =
    React.useState<number | null>(null);
  const removedReferenceHistoryRef = React.useRef<NotebookAppViewReference[]>(
    [],
  );
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
  const visibleCellIndices = useMemo(
    () => new Set(displayItems.map((item) => item.cellIndex)),
    [displayItems],
  );
  const tocItems = useMemo(
    () =>
      businessMode
        ? flattenNotebookTocSections(
            buildNotebookMinimap(notebook.cells),
            visibleCellIndices,
          )
        : [],
    [businessMode, notebook, visibleCellIndices],
  );
  const showTocRail = businessMode && tocItems.length > 0;

  React.useEffect(() => {
    removedReferenceHistoryRef.current = [];
  }, [notebookPath]);

  React.useEffect(() => {
    setEditingMarkdownCellIndex(null);
  }, [businessEditMode, businessMode, notebookPath]);

  /** Returns true when the reference currently belongs to App View metadata. */
  const isReferenceSelected = React.useCallback(
    (reference: NotebookAppViewReference) => {
      const cell = notebook.cells[reference.cellIndex];
      if (!cell) return false;

      return reference.kind === "markdown"
        ? isNotebookCellInAppView(cell)
        : isNotebookOutputInAppView(cell, reference.outputIndex);
    },
    [notebook.cells],
  );

  /** Removes a reference and stores it so Cmd/Ctrl+Z can restore it. */
  const removeAppViewReference = React.useCallback(
    (reference: NotebookAppViewReference) => {
      if (isReferenceSelected(reference)) {
        removedReferenceHistoryRef.current.push(reference);
      }
      onRemoveAppViewReference?.(reference);
    },
    [isReferenceSelected, onRemoveAppViewReference],
  );

  /** Restores the most recent App View removal. */
  const restoreLastRemovedReference = React.useCallback(() => {
    const reference = removedReferenceHistoryRef.current.pop();
    if (!reference) return false;

    onRestoreAppViewReference?.(reference);
    return true;
  }, [onRestoreAppViewReference]);

  React.useEffect(() => {
    if (!undoRemovalEnabled || !onRestoreAppViewReference) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "z") return;
      if (
        isEditableKeyboardTarget(event.target) ||
        isEditableKeyboardTarget(document.activeElement)
      ) {
        return;
      }

      if (restoreLastRemovedReference()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [
    onRestoreAppViewReference,
    restoreLastRemovedReference,
    undoRemovalEnabled,
  ]);

  /** Scrolls the App View surface to a rendered cell. */
  const handleTocNavigate = React.useCallback((cellIndex: number) => {
    const targetElement =
      rootRef.current?.querySelector<HTMLElement>(
        `[data-app-view-cell-index="${cellIndex}"]`,
      ) ?? null;

    if (!targetElement) {
      return;
    }

    targetElement.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

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

  /** Requests that the chat composer attach the selected App View markdown cell. */
  const handleMentionMarkdownCell = React.useCallback(
    (cellIndex: number) => {
      if (!notebookPath) return;

      window.dispatchEvent(
        new CustomEvent("orion:mention-notebook-cell", {
          detail: {
            notebookPath,
            cellIndex,
            preview: sourceToString(notebook.cells[cellIndex]?.source),
          },
        }),
      );
    },
    [notebook.cells, notebookPath],
  );

  /** Removes an output from App View through the editor-owned metadata path. */
  const handleRemoveOutput = React.useCallback(
    (cellIndex: number, outputIndex: number) => {
      removeAppViewReference({
        kind: "output",
        cellIndex,
        outputIndex,
      });
    },
    [removeAppViewReference],
  );

  /** Starts editing a single Business-mode markdown block. */
  const handleStartEditingMarkdownCell = React.useCallback(
    (cellIndex: number) => {
      if (
        !businessEditMode ||
        !onSaveMarkdownCell ||
        editingMarkdownCellIndex !== null
      ) {
        return;
      }
      setEditingMarkdownCellIndex(cellIndex);
    },
    [businessEditMode, editingMarkdownCellIndex, onSaveMarkdownCell],
  );

  /** Leaves the current Business-mode markdown editor without persisting its draft. */
  const handleCancelEditingMarkdownCell = React.useCallback(() => {
    setEditingMarkdownCellIndex(null);
  }, []);

  /** Persists a Business-mode markdown edit through the editor-owned callback. */
  const handleSaveMarkdownCell = React.useCallback(
    async (cellIndex: number, source: string) => {
      if (!onSaveMarkdownCell) return;
      await onSaveMarkdownCell(cellIndex, source);
    },
    [onSaveMarkdownCell],
  );

  if (displayItems.length > 0) {
    return (
      <div className="relative flex min-h-0 flex-1 bg-sidebar">
        {showTocRail ? (
          <div className="absolute left-1 top-1/2 z-40 -translate-y-1/2">
            <NotebookAppViewTocRail
              items={tocItems}
              onNavigate={handleTocNavigate}
            />
          </div>
        ) : null}
        <div
          ref={rootRef}
          className="orion-app-view min-h-0 flex-1 overflow-y-auto bg-sidebar"
          data-notebook-export-root="app"
        >
          <main
            className={cn(
              "mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 p-4",
              showTocRail && "pl-10",
            )}
          >
            {displayItems.map((item) => {
              if (item.kind === "markdown") {
                const source = sourceToString(item.cell.source);
                const hasBusinessMarkdownEditor =
                  businessMode && Boolean(onSaveMarkdownCell);

                return (
                  <AppViewMarkdownContextMenu
                    key={`markdown-${item.cellIndex}`}
                    businessMode={businessMode}
                    disabled={
                      businessEditMode &&
                      editingMarkdownCellIndex === item.cellIndex
                    }
                    onMention={
                      notebookPath
                        ? () => handleMentionMarkdownCell(item.cellIndex)
                        : undefined
                    }
                    onRemove={
                      onRemoveAppViewReference
                        ? () =>
                            removeAppViewReference({
                              kind: "markdown",
                              cellIndex: item.cellIndex,
                            })
                        : undefined
                    }
                  >
                    {hasBusinessMarkdownEditor ? (
                      <BusinessMarkdownCell
                        cellIndex={item.cellIndex}
                        source={source}
                        isEditMode={businessEditMode}
                        isEditing={
                          businessEditMode &&
                          editingMarkdownCellIndex === item.cellIndex
                        }
                        canStartEditing={editingMarkdownCellIndex === null}
                        onStartEditing={() =>
                          handleStartEditingMarkdownCell(item.cellIndex)
                        }
                        onCancelEditing={handleCancelEditingMarkdownCell}
                        onFinishEditing={handleCancelEditingMarkdownCell}
                        onSave={(nextSource) =>
                          handleSaveMarkdownCell(item.cellIndex, nextSource)
                        }
                      />
                    ) : (
                      <div
                        className="jp-Cell jp-MarkdownCell"
                        data-app-view-cell-index={item.cellIndex}
                      >
                        <MarkdownRenderer source={source} />
                      </div>
                    )}
                  </AppViewMarkdownContextMenu>
                );
              }

              const canMentionOutput =
                businessMode && businessEditMode && Boolean(notebookPath);

              return (
                <div
                  key={`output-${item.cellIndex}-${item.outputIndex}`}
                  className={cn(
                    "jp-Cell jp-CodeCell",
                    canMentionOutput &&
                      "cursor-pointer transition-opacity hover:opacity-50",
                  )}
                  data-app-view-cell-index={item.cellIndex}
                  data-app-view-output-index={item.outputIndex}
                  onClickCapture={
                    canMentionOutput
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleMentionOutput(item.cellIndex, item.outputIndex);
                        }
                      : undefined
                  }
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
                      businessMode={businessMode}
                      onMentionOutput={
                        notebookPath ? handleMentionOutput : undefined
                      }
                      onToggleOutputAppView={
                        onRemoveAppViewReference
                          ? handleRemoveOutput
                          : undefined
                      }
                      isInAppView
                      onOrionUiStateChange={(key, value, outputId, change) => {
                        if (change === undefined) {
                          onOrionUiStateChange?.(key, value, outputId);
                          return;
                        }
                        onOrionUiStateChange?.(key, value, outputId, change);
                      }}
                      onOrionUiAction={onOrionUiAction}
                      onOrionUiUnmount={onOrionUiUnmount}
                      onOrionUiTableRequest={onOrionUiTableRequest}
                      onOrionUiTableMetadataChange={
                        onOrionUiTableMetadataChange
                      }
                    />
                  )}
                </div>
              );
            })}
          </main>
        </div>
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
