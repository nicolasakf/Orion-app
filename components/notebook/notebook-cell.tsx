"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  CellType,
  OutputType,
  type NotebookCellType,
  CellExecutionStatus,
  type CellExecutionInfo,
} from "@/lib/types";
import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import { MonacoEditor } from "@/components/monaco-editor";
import { OutputRenderer } from "@/components/notebook/output-renderer";
import type { OrionUiLocalValue } from "@/components/notebook/orion-ui-primitives";
import {
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  ArrowUp,
  ArrowDown,
  Play,
  Trash2,
  Plus,
  Check,
  ChevronsUpDown,
  ChevronsDownUp,
  X,
  Loader2,
  XCircle,
  Clock,
  Timer,
  Zap,
  ChevronsUp,
  ChevronsDown,
  Scissors,
  FileText,
  Bold,
  Italic,
  Link,
  Code2,
  Heading1,
  Quote,
  List,
  ListOrdered,
  SquareCode,
  WrapText,
  Palette,
  AlertTriangle,
  LayoutTemplate,
  AtSign,
} from "lucide-react";
import {
  CmdOrCtrl,
  Shift,
  Enter,
  AltOrOption,
  ArrowUp as ArrowUpIcon,
  ArrowDown as ArrowDownIcon,
} from "@/components/common/keyboard-icons";
import { cn } from "@/lib/utils";
import { FileIcon } from "@/components/common/file-icon";
import type { OnMount } from "@monaco-editor/react";
import type {
  editor as MonacoEditorApi,
  IRange,
  ISelection,
  Selection as MonacoSelection,
} from "monaco-editor/esm/vs/editor/editor.api";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import "@uiw/react-markdown-preview/markdown.css";
import { useTheme } from "next-themes";
import { CellContextMenu } from "./cell-context-menu";
import { CellOutputToolbar } from "./cell-output-toolbar";
import {
  getOutputPersistedCollapsed,
  getOutputTextLength,
  TEXT_OUTPUT_AUTO_COLLAPSE_THRESHOLD,
} from "@/components/notebook/utils";
import type { MimeClipboardPayload } from "@/lib/notebook/mime-registry";
import { getDefaultMimeRegistry } from "@/lib/notebook/mime-registry";
import {
  isNotebookCellInAppView,
  isNotebookOutputInAppView,
} from "@/lib/notebook/app-view";
import { getRelativeTime } from "@/lib/utils";

interface NotebookCellProps {
  cell: NotebookCellType;
  notebookMetadata?: Record<string, unknown>;
  notebookPath?: string;
  cellIndex: number;
  onCellModified?: (cellIndex: number, source?: string) => void;
  onUpdateCell?: (cellIndex: number, source: string) => void;
  onCellSelect?: (
    cellIndex: number,
    event?: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  onCellMouseDownCapture?: (
    cellIndex: number,
    event: React.MouseEvent,
  ) => void;
  onCellAction?: (action: string, cellIndex: number) => void;
  isSelected?: boolean;
  onEditingModeChange?: (cellIndex: number, isEditing: boolean) => void;
  onUpdateCellMetadata?: (cellIndex: number, metadata: any) => void;
  onUpdateCellData?: (cellIndex: number, cell: NotebookCellType) => void;
  onRegisterRef?: (
    cellIndex: number,
    ref: { getSource: () => string; focusSource: () => void } | null,
  ) => void;
  onContentChange?: (cellIndex: number, source: string) => void;
  onMentionCell?: (cellIndex: number) => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
  variant?: "default" | "ghost";
  validationIssue?: string;
  /**
   * When true, hides code cell inputs in the UI without changing saved
   * metadata (`isInputHidden`). Markdown and raw cells are unaffected.
   */
  presentationHideAllCellInputs?: boolean;
}

const COLLAPSED_CONTENT_HEIGHT_DEFAULT = 192;

/** Returns true when keyboard input belongs to a text-editing control. */
function isCellEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ),
  );
}

/**
 * Combobox component for selecting cell type
 */
function CellTypeCombobox({
  cellType,
  hasLocalChanges,
  onCellTypeChange,
}: {
  cellType: CellType;
  hasLocalChanges: boolean;
  onCellTypeChange?: (cellType: CellType) => void;
}) {
  const [open, setOpen] = useState(false);

  const cellTypes = [
    {
      value: CellType.CODE,
      label: "Code",
      icon: <Code className="h-3.5 w-3.5 text-green-500 mr-1.5" />,
    },
    {
      value: CellType.MARKDOWN,
      label: "Markdown",
      icon: <FileIcon filename="cell.md" className="mr-1.5" />,
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "group flex items-center justify-start h-6 px-1 text-xs font-medium",
            "bg-transparent hover:bg-transparent active:bg-transparent",
            "focus-visible:bg-transparent data-[state=open]:bg-transparent",
            hasLocalChanges && "text-yellow-500",
          )}
          onClick={(e) => {
            e.stopPropagation(); // Prevent cell selection when clicking the combobox
          }}
        >
          <span className="inline-flex shrink-0 items-center opacity-100 transition-opacity group-hover:opacity-50">
            {cellTypes.find((type) => type.value === cellType)?.icon}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[160px] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {cellTypes.map((type) => (
                <CommandItem
                  key={type.value}
                  value={type.value}
                  onSelect={() => {
                    if (onCellTypeChange && type.value !== cellType) {
                      onCellTypeChange(type.value);
                    }
                    setOpen(false);
                  }}
                >
                  {type.icon}
                  {type.label}
                  <Check
                    className={cn(
                      "ml-auto",
                      cellType === type.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Action button component with tooltip
 */
function ActionButton({
  icon: Icon,
  label,
  shortcut,
  action,
  onClick,
  className,
}: {
  icon: React.ComponentType<any>;
  label: string | string[];
  shortcut?: ShortcutSequence | ShortcutSequence[];
  action: string;
  onClick: (action: string, e: React.MouseEvent) => void;
  className?: string;
}) {
  const labels = Array.isArray(label) ? label : label ? [label] : [];
  const shortcuts = Array.isArray(shortcut)
    ? shortcut
    : shortcut
      ? [shortcut]
      : [];

  if (shortcuts.length > 0 && labels.length !== shortcuts.length) {
    console.error(
      "label and shortcut props should have the same number of elements for ActionButton.",
    );
  }

  const renderShortcut = (shortcutElement: ShortcutElement) => {
    if (typeof shortcutElement === "string") {
      return shortcutElement;
    } else {
      // It's a React component
      const ShortcutComponent = shortcutElement;
      return <ShortcutComponent className="h-3 w-3" />;
    }
  };

  const renderShortcutSequence = (sequence: ShortcutSequence) => {
    if (Array.isArray(sequence)) {
      // Check if this is an array of ShortcutElements (a sequence)
      if (
        sequence.length > 0 &&
        (typeof sequence[0] === "string" || typeof sequence[0] === "function")
      ) {
        return sequence.map((element, index) => (
          <React.Fragment key={index}>
            {renderShortcut(element as ShortcutElement)}
          </React.Fragment>
        ));
      }
    }
    return renderShortcut(sequence as ShortcutElement);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex justify-center items-center px-1 cursor-pointer">
          <Icon
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors",
              className,
            )}
            onClick={(e: any) => onClick(action, e)}
            aria-label={label}
          />
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom" className="z-[100] px-1.5">
          <div className="items-center space-y-1">
            {labels.map((l, index) => (
              <div key={index + l} className="flex items-center gap-2">
                <p className="text-xs">{l}</p>
                {shortcuts[index] && (
                  <kbd className="pointer-events-none inline-flex shrink-0 flex-nowrap h-5 min-h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[12px] font-medium text-muted-foreground opacity-100 ml-auto">
                    {renderShortcutSequence(shortcuts[index])}
                  </kbd>
                )}
              </div>
            ))}
          </div>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/**
 * Status indicator component
 */
function StatusIndicator({ status }: { status: CellExecutionStatus }) {
  const getStatusIcon = () => {
    switch (status) {
      case CellExecutionStatus.QUEUED:
        return (
          <Timer
            className="h-3.5 w-3.5 text-muted-foreground animate-pulse"
            aria-label="Queued for execution"
          />
        );
      case CellExecutionStatus.RUNNING:
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case CellExecutionStatus.SUCCESS:
        return <Check className="h-3.5 w-3.5 text-green-500" />;
      case CellExecutionStatus.ERROR:
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return null;
    }
  };

  const icon = getStatusIcon();
  if (!icon) return null;

  return <div className="flex items-center">{icon}</div>;
}

/** Execution info: last run time and wall-clock duration (inline, no hover card). */
function ExecutionInfo({
  lastExecuted,
  duration,
}: {
  lastExecuted?: Date | string;
  duration?: number;
}) {
  if (!lastExecuted && !duration) return null;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const formatTime = (date: Date | string) => {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    const diffTime = now.getTime() - dateObj.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // If more than 1 day ago, use getRelativeTime
    if (diffDays > 1) {
      return getRelativeTime(dateObj);
    }

    // Otherwise use the original time format
    return dateObj.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <div className="flex items-center gap-2 text-[11px] leading-none text-muted-foreground">
      {lastExecuted && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatTime(lastExecuted)}</span>
              </div>
            </TooltipTrigger>
            {/* Portal to body so the tooltip isn’t covered by the right panel (see ToolbarButton). */}
            <TooltipPortal>
              <TooltipContent side="bottom" className="z-[100]">
                <p>
                  Last executed at{" "}
                  {typeof lastExecuted === "string"
                    ? new Date(lastExecuted).toLocaleString()
                    : lastExecuted.toLocaleString()}
                </p>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      )}

      {duration && (
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          <span>{formatDuration(duration)}</span>
        </div>
      )}
    </div>
  );
}

// Added type definition for action buttons
type ShortcutElement = string | React.ComponentType<{ className?: string }>;
type ShortcutSequence = ShortcutElement | ShortcutElement[];

type ActionButtonDefinition = {
  icon: React.ComponentType<any>;
  label: string | string[];
  shortcut?: ShortcutSequence | ShortcutSequence[];
  action: string;
  cellTypes?: CellType[];
  className?: string;
  separatorBefore?: boolean;
};

type MarkdownFormatAction =
  | "bold"
  | "italic"
  | "link"
  | "inline-code"
  | "text-color"
  | "heading"
  | "quote"
  | "bulleted-list"
  | "numbered-list"
  | "code-block";

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type LineMarkdownFormatAction = Extract<
  MarkdownFormatAction,
  "heading" | "quote" | "bulleted-list" | "numbered-list"
>;

type InlineMarkdownFormatAction = Exclude<
  MarkdownFormatAction,
  LineMarkdownFormatAction
>;

type MarkdownToolbarButtonDefinition = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action: MarkdownFormatAction;
};

type MarkdownEditPlan = {
  range: IRange;
  text: string;
  originalStartOffset: number;
  originalEndOffset: number;
  selectionStartOffset: number;
  selectionEndOffset: number;
};

const markdownToolbarButtons: MarkdownToolbarButtonDefinition[] = [
  { icon: Bold, label: "Bold", action: "bold" },
  { icon: Italic, label: "Italic", action: "italic" },
  { icon: Link, label: "Link", action: "link" },
  { icon: Code2, label: "Inline code", action: "inline-code" },
  { icon: Quote, label: "Quote", action: "quote" },
  { icon: List, label: "Bulleted list", action: "bulleted-list" },
  { icon: ListOrdered, label: "Numbered list", action: "numbered-list" },
  { icon: SquareCode, label: "Code block", action: "code-block" },
];

/** Returns true when a markdown toolbar action formats entire lines. */
function isLineMarkdownFormatAction(
  action: MarkdownFormatAction,
): action is LineMarkdownFormatAction {
  return (
    action === "heading" ||
    action === "quote" ||
    action === "bulleted-list" ||
    action === "numbered-list"
  );
}

/** Creates an absolute Monaco selection object from two model offsets. */
function createSelectionFromOffsets(
  model: MonacoEditorApi.ITextModel,
  startOffset: number,
  endOffset: number,
): ISelection {
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);

  return {
    selectionStartLineNumber: start.lineNumber,
    selectionStartColumn: start.column,
    positionLineNumber: end.lineNumber,
    positionColumn: end.column,
  };
}

/** Builds one markdown edit for the requested toolbar action and selection. */
function createMarkdownEditPlan(
  action: MarkdownFormatAction,
  selection: MonacoSelection,
  model: MonacoEditorApi.ITextModel,
  headingLevel: MarkdownHeadingLevel = 1,
): MarkdownEditPlan {
  const selectedText = model.getValueInRange(selection);
  const isEmptySelection = selection.isEmpty();
  const originalStartOffset = model.getOffsetAt(selection.getStartPosition());
  const originalEndOffset = model.getOffsetAt(selection.getEndPosition());

  if (isLineMarkdownFormatAction(action)) {
    let endLineNumber = selection.endLineNumber;
    if (!isEmptySelection && selection.endColumn === 1) {
      endLineNumber = Math.max(selection.startLineNumber, endLineNumber - 1);
    }

    const prefixByAction: Record<LineMarkdownFormatAction, string> = {
      heading: `${"#".repeat(headingLevel)} `,
      quote: "> ",
      "bulleted-list": "- ",
      "numbered-list": "1. ",
    };
    const prefix = prefixByAction[action];
    const range = {
      startLineNumber: selection.startLineNumber,
      startColumn: 1,
      endLineNumber,
      endColumn: model.getLineMaxColumn(endLineNumber),
    };
    const lines: string[] = [];
    for (
      let lineNumber = range.startLineNumber;
      lineNumber <= range.endLineNumber;
      lineNumber += 1
    ) {
      lines.push(`${prefix}${model.getLineContent(lineNumber)}`);
    }
    const text = lines.join("\n");

    return {
      range,
      text,
      originalStartOffset: model.getOffsetAt({
        lineNumber: range.startLineNumber,
        column: range.startColumn,
      }),
      originalEndOffset: model.getOffsetAt({
        lineNumber: range.endLineNumber,
        column: range.endColumn,
      }),
      selectionStartOffset: text.length,
      selectionEndOffset: text.length,
    };
  }

  const replacementByAction: Record<
    InlineMarkdownFormatAction,
    { text: string; selectionStartOffset: number; selectionEndOffset: number }
  > = {
    bold: {
      text: `**${selectedText || "bold text"}**`,
      selectionStartOffset: 2,
      selectionEndOffset: 2 + (selectedText || "bold text").length,
    },
    italic: {
      text: `*${selectedText || "italic text"}*`,
      selectionStartOffset: 1,
      selectionEndOffset: 1 + (selectedText || "italic text").length,
    },
    link: selectedText
      ? {
        text: `[${selectedText}](url)`,
        selectionStartOffset: selectedText.length + 3,
        selectionEndOffset: selectedText.length + 6,
      }
      : {
        text: "[text](url)",
        selectionStartOffset: 1,
        selectionEndOffset: 5,
      },
    "text-color": {
      text: `<span style="color: #2563eb">${selectedText || "text"}</span>`,
      selectionStartOffset: '<span style="color: '.length,
      selectionEndOffset: '<span style="color: #2563eb'.length,
    },
    "inline-code": {
      text: `\`${selectedText || "code"}\``,
      selectionStartOffset: 1,
      selectionEndOffset: 1 + (selectedText || "code").length,
    },
    "code-block": {
      text: `\`\`\`\n${selectedText || "code"}\n\`\`\``,
      selectionStartOffset: 4,
      selectionEndOffset: 4 + (selectedText || "code").length,
    },
  };
  const replacement = replacementByAction[action];

  return {
    range: selection,
    text: replacement.text,
    originalStartOffset,
    originalEndOffset,
    selectionStartOffset: replacement.selectionStartOffset,
    selectionEndOffset: replacement.selectionEndOffset,
  };
}

/** Returns true when a parsed JSON value can replace a notebook cell. */
function isNotebookCell(value: unknown): value is NotebookCellType {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<NotebookCellType>;
  const hasValidCellType = Object.values(CellType).includes(
    candidate.cell_type as CellType,
  );
  const hasValidSource =
    Array.isArray(candidate.source) &&
    candidate.source.every((line) => typeof line === "string");
  const hasValidMetadata =
    candidate.metadata === undefined ||
    (typeof candidate.metadata === "object" &&
      candidate.metadata !== null &&
      !Array.isArray(candidate.metadata));
  const hasValidExecutionCount =
    candidate.execution_count === undefined ||
    candidate.execution_count === null ||
    typeof candidate.execution_count === "number";
  const hasValidOutputs =
    candidate.outputs === undefined || Array.isArray(candidate.outputs);

  return (
    hasValidCellType &&
    hasValidSource &&
    hasValidMetadata &&
    hasValidExecutionCount &&
    hasValidOutputs
  );
}

/** Renders cell header action buttons in fixed order (no drag-and-drop). */
function CellHeaderActionButtons({
  actionButtons,
  onAction,
  cellType,
}: {
  actionButtons: ActionButtonDefinition[];
  onAction: (action: string, e: React.MouseEvent) => void;
  cellType: CellType;
}) {
  return (
    <div className="flex items-center gap-1">
      {actionButtons
        .filter(
          (button) => !button.cellTypes || button.cellTypes.includes(cellType),
        )
        .map((button) => (
          <React.Fragment key={button.action}>
            {button.separatorBefore ? (
              <Separator
                orientation="vertical"
                className="mx-0.5 h-4 bg-cell-separator-foreground"
              />
            ) : null}
            <div className="flex items-center group">
              <ActionButton
                icon={button.icon}
                label={button.label}
                shortcut={button.shortcut}
                action={button.action}
                className={button.className}
                onClick={onAction}
              />
            </div>
          </React.Fragment>
        ))}
    </div>
  );
}

/** Renders markdown syntax buttons without stealing Monaco focus. */
function MarkdownFormattingToolbar({
  onFormat,
  onToggleLineWrapping,
  onOpenColorPicker,
  isLineWrappingEnabled,
}: {
  onFormat: (
    action: MarkdownFormatAction,
    headingLevel?: MarkdownHeadingLevel,
  ) => void;
  onToggleLineWrapping: () => void;
  onOpenColorPicker: () => void;
  isLineWrappingEnabled: boolean;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="flex min-h-8 items-center gap-0.5 border-b border-muted bg-muted/60 px-2"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                isLineWrappingEnabled
                  ? "Disable line wrapping"
                  : "Enable line wrapping"
              }
              className={cn(
                "h-6 w-6 text-muted-foreground hover:text-foreground",
                isLineWrappingEnabled && "bg-accent text-accent-foreground",
              )}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleLineWrapping();
              }}
            >
              <WrapText className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="top" className="z-[100] px-1.5">
              <p className="text-xs">Toggle line wrapping</p>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Text color"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenColorPicker();
              }}
            >
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="top" className="z-[100] px-1.5">
              <p className="text-xs">Text color</p>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Heading 1"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onFormat("heading");
              }}
            >
              <Heading1 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="top" className="z-[100] px-1.5">
              <p className="text-xs">Heading 1</p>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>

        {markdownToolbarButtons.map((button) => {
          const Icon = button.icon;

          return (
            <Tooltip key={button.action}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={button.label}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onFormat(button.action);
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="top" className="z-[100] px-1.5">
                  <p className="text-xs">{button.label}</p>
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          );
        })}

        <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <kbd className="pointer-events-none inline-flex shrink-0 flex-nowrap h-5 min-h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[12px] font-medium text-muted-foreground">
            Esc
          </kbd>
          <span>to exit edit mode</span>
        </span>
      </div>
    </TooltipProvider>
  );
}

/**
 * Component to display and edit a single notebook cell
 * Using memo to prevent re-renders when other cells change
 */
function NotebookCellComponent({
  cell,
  notebookMetadata,
  notebookPath,
  cellIndex,
  onCellModified,
  onUpdateCell,
  onCellSelect,
  onCellMouseDownCapture,
  onCellAction,
  isSelected = false,
  onEditingModeChange,
  onUpdateCellMetadata,
  onUpdateCellData,
  onRegisterRef,
  onContentChange,
  onMentionCell,
  onOrionUiStateChange,
  onOrionUiAction,
  variant,
  validationIssue,
  presentationHideAllCellInputs,
}: NotebookCellProps) {
  const parseError: string | undefined = (cell.metadata as any)?.orion
    ?._parseError;

  // Default to ghost variant for markdown cells
  const effectiveVariant =
    variant ?? (cell.cell_type === CellType.MARKDOWN ? "ghost" : "default");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const safeSource = Array.isArray(cell.source) ? cell.source : [];
  const [localSource, setLocalSource] = useState(safeSource.join(""));
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [isMarkdownLineWrappingEnabled, setIsMarkdownLineWrappingEnabled] =
    useState(true);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cellContainerRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const changeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const monacoEditorInstanceRef =
    useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const markdownEditorInstanceRef =
    useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const shouldFocusMarkdownEditorRef = useRef(false);
  const shouldPlaceMarkdownCursorAtStartRef = useRef(false);
  const { theme } = useTheme();
  const mimeRegistry = React.useMemo(() => getDefaultMimeRegistry(), []);
  const [isMetadataEditingMode, setIsMetadataEditingMode] = useState(false);
  const [localMetadata, setLocalMetadata] = useState("");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [hasMentionableEditorSelection, setHasMentionableEditorSelection] =
    useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentScrollHeight, setContentScrollHeight] = useState(0);
  const outputContentRef = useRef<HTMLDivElement>(null);
  const [outputScrollHeight, setOutputScrollHeight] = useState(0);
  const [outputScrollEdges, setOutputScrollEdges] = useState({
    top: false,
    bottom: false,
  });

  // Cell visibility state
  const [isInputHidden, setIsInputHidden] = useState(false);
  const [isOutputHidden, setIsOutputHidden] = useState(false);
  const [isWholeCellHidden, setIsWholeCellHidden] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Separate collapse states for input and output
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);

  // Output toolbar hover tracking
  const [hoveredOutputIndex, setHoveredOutputIndex] = useState<number | null>(
    null,
  );
  const hideToolbarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ephemeral auto-collapse for large outputs without persisted metadata
  const [autoCollapsedOutputs, setAutoCollapsedOutputs] = useState<
    Record<number, boolean>
  >({});

  // Track cell identity to detect when a different cell lands at this index
  // (e.g. after move up/down). Using index-based keys prevents DOM reparenting
  // which would crash Monaco, but we must sync local state when the cell changes.
  const cellId = (cell.metadata as any)?.orion?.id;
  const prevCellIdRef = useRef(cellId);

  useEffect(() => {
    if (prevCellIdRef.current !== cellId) {
      prevCellIdRef.current = cellId;
      const newSource = Array.isArray(cell.source) ? cell.source.join("") : "";
      setLocalSource(newSource);
      setIsEditingMode(false);
      setHasLocalChanges(false);
      setIsMetadataEditingMode(false);
      const orionMeta = (cell.metadata as any)?.orion;
      setIsInputHidden(orionMeta?.isInputHidden ?? false);
      setIsOutputHidden(orionMeta?.isOutputHidden ?? false);
      setIsWholeCellHidden(orionMeta?.isWholeCellHidden ?? false);
      setIsMuted(orionMeta?.cellState?.isMuted ?? orionMeta?.isMuted ?? false);
      setIsInputCollapsed(orionMeta?.isInputCollapsed ?? false);
      setIsOutputCollapsed(orionMeta?.isOutputCollapsed ?? false);
      setHasMentionableEditorSelection(false);
    }
  }, [cellId, cell.source, cell.metadata]);

  // Create a ref object that exposes getSource and focusSource methods
  const cellRef = useRef({
    getSource: () => localSource,
    focusSource: () => { },
  });

  // Update the ref whenever localSource changes
  useEffect(() => {
    cellRef.current.getSource = () => localSource;
  }, [localSource]);

  /** Focuses markdown Monaco after mount and optionally places the caret at the start. */
  const focusMarkdownEditor = useCallback(
    (editor = markdownEditorInstanceRef.current) => {
      if (!editor) return;

      if (shouldPlaceMarkdownCursorAtStartRef.current) {
        const firstPosition = { lineNumber: 1, column: 1 };
        editor.setPosition(firstPosition);
        editor.revealPositionNearTop(firstPosition);
      }

      editor.focus();
      shouldFocusMarkdownEditorRef.current = false;
      shouldPlaceMarkdownCursorAtStartRef.current = false;
    },
    [],
  );

  /** Enters markdown edit mode and focuses Monaco after it mounts. */
  const beginMarkdownEditing = useCallback(
    (options: { placeCursorAtStart?: boolean } = {}) => {
      shouldFocusMarkdownEditorRef.current = true;
      shouldPlaceMarkdownCursorAtStartRef.current = Boolean(
        options.placeCursorAtStart,
      );
      setIsEditingMode(true);
    },
    [],
  );

  /** Tracks whether the active source editor has a non-empty selection to mention. */
  const registerMentionSelectionTracker = useCallback(
    (editor: MonacoEditorApi.IStandaloneCodeEditor) => {
      const setSelectionVisible = (visible: boolean) => {
        setHasMentionableEditorSelection((current) =>
          current === visible ? current : visible,
        );
      };

      const updateSelectionVisible = () => {
        const model = editor.getModel();
        const selection = editor.getSelection();
        const hasSelection = Boolean(
          notebookPath &&
          model &&
          selection &&
          !selection.isEmpty() &&
          model.getValueInRange(selection).trim(),
        );
        setSelectionVisible(hasSelection);
      };

      const selectionDisposable =
        editor.onDidChangeCursorSelection(updateSelectionVisible);
      const focusDisposable =
        editor.onDidFocusEditorWidget(updateSelectionVisible);
      const blurDisposable = editor.onDidBlurEditorWidget(() => {
        setSelectionVisible(false);
      });
      const disposeDisposable = editor.onDidDispose(() => {
        selectionDisposable.dispose();
        focusDisposable.dispose();
        blurDisposable.dispose();
        disposeDisposable.dispose();
        setSelectionVisible(false);
      });

      updateSelectionVisible();
    },
    [notebookPath],
  );

  useEffect(() => {
    if (
      cell.cell_type !== CellType.MARKDOWN ||
      !isEditingMode ||
      !shouldFocusMarkdownEditorRef.current
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      focusMarkdownEditor();
    });
  }, [cell.cell_type, focusMarkdownEditor, isEditingMode]);

  // Update focusSource to enter edit mode and focus the cell source
  useEffect(() => {
    cellRef.current.focusSource = () => {
      if (cell.cell_type === CellType.CODE) {
        if (monacoEditorInstanceRef.current) {
          monacoEditorInstanceRef.current.focus();
        }
      } else if (cell.cell_type === CellType.MARKDOWN) {
        beginMarkdownEditing({ placeCursorAtStart: true });
      }
    };
  }, [beginMarkdownEditing, cell.cell_type]);

  // Register this cell's ref with the parent on mount and cleanup on unmount
  useEffect(() => {
    if (onRegisterRef) {
      onRegisterRef(cellIndex, cellRef.current);

      return () => {
        onRegisterRef(cellIndex, null);
      };
    }
  }, [cellIndex, onRegisterRef]);

  // Effect to call onEditingModeChange when isEditingMode changes
  useEffect(() => {
    onEditingModeChange?.(cellIndex, isEditingMode);
  }, [isEditingMode, cellIndex, onEditingModeChange]);

  /**
   * Intercepts editing shortcuts in capture phase before Monaco handles them.
   * Esc returns focus to the cell shell so command-mode navigation stays active.
   */
  useEffect(() => {
    const container = cellContainerRef.current;
    if (!container || !isEditingMode) return;

    const handleEditingKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        (document.activeElement as HTMLElement | null)?.blur();
        setIsEditingMode(false);
        onCellSelect?.(cellIndex);
        window.requestAnimationFrame(() => {
          cellContainerRef.current?.focus();
        });
        return;
      }

      if (
        event.key === "Enter" &&
        (event.shiftKey || event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        (document.activeElement as HTMLElement)?.blur();

        if (event.metaKey || event.ctrlKey) {
          onCellAction?.("run", cellIndex);
        } else if (event.shiftKey) {
          onCellAction?.("run-and-advance", cellIndex);
        }
      }
    };

    container.addEventListener("keydown", handleEditingKeyDown, true);
    return () => {
      container.removeEventListener("keydown", handleEditingKeyDown, true);
    };
  }, [isEditingMode, cellIndex, onCellAction, onCellSelect]);

  // NEW: Update contentScrollHeight when content changes or collapse state changes
  useEffect(() => {
    if (contentRef.current) {
      setContentScrollHeight(contentRef.current.scrollHeight);
    }
  }, [localSource, isInputCollapsed, isOutputCollapsed, isMetadataEditingMode]);

  /**
   * Measures output container overflow and tracks top/bottom edges for gradients.
   */
  const updateOutputScrollMetrics = useCallback(() => {
    const el = outputContentRef.current;
    if (!el) return;
    setOutputScrollHeight(el.scrollHeight);
    setOutputScrollEdges({
      top: el.scrollTop > 0,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    const hasVisibleOutputs =
      !isOutputHidden && !!cell.outputs && cell.outputs.length > 0;
    if (!hasVisibleOutputs) {
      setOutputScrollHeight(0);
      setOutputScrollEdges({ top: false, bottom: false });
      return;
    }

    const el = outputContentRef.current;
    if (!el) return;

    updateOutputScrollMetrics();
    const resizeObserver = new ResizeObserver(updateOutputScrollMetrics);
    resizeObserver.observe(el);
    el.addEventListener("scroll", updateOutputScrollMetrics);

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("scroll", updateOutputScrollMetrics);
    };
  }, [
    cell.outputs,
    isOutputHidden,
    autoCollapsedOutputs,
    isOutputCollapsed,
    updateOutputScrollMetrics,
  ]);

  /** Resolves collapsed UI state from saved metadata or ephemeral auto-collapse. */
  const isOutputCollapsedAtIndex = useCallback(
    (outputIndex: number) => {
      const output = cell.outputs?.[outputIndex];
      if (!output) return false;
      const persisted = getOutputPersistedCollapsed(output);
      if (persisted !== undefined) return persisted;
      return !!autoCollapsedOutputs[outputIndex];
    },
    [cell.outputs, autoCollapsedOutputs],
  );

  // Auto-collapse large text outputs and reset state when outputs are cleared
  useEffect(() => {
    if (!cell.outputs || cell.outputs.length === 0) {
      setAutoCollapsedOutputs({});
      return;
    }

    setAutoCollapsedOutputs((prev) => {
      const updated = { ...prev };
      let changed = false;

      cell.outputs!.forEach((output, idx) => {
        if (getOutputPersistedCollapsed(output) !== undefined) return;
        if (idx in updated) return;
        const len = getOutputTextLength(output);
        if (len > TEXT_OUTPUT_AUTO_COLLAPSE_THRESHOLD) {
          updated[idx] = true;
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [cell.outputs]);

  // Helper function to safely access execution info
  const getExecutionInfo = useCallback(() => {
    return cell.metadata?.orion?.cellState?.executionInfo;
  }, [cell.metadata]);

  const hasCodeOutputs =
    cell.cell_type === CellType.CODE && !!cell.outputs?.length;
  const allCodeOutputsInAppView =
    hasCodeOutputs &&
    cell.outputs!.every((_, outputIndex) =>
      isNotebookOutputInAppView(cell, outputIndex),
    );
  const isInAppView =
    cell.cell_type === CellType.CODE
      ? allCodeOutputsInAppView
      : isNotebookCellInAppView(cell);

  // Action button definitions (App View control is omitted for code cells with no outputs)
  const actionButtons = useMemo<ActionButtonDefinition[]>(() => {
    const buttons: ActionButtonDefinition[] = [
      {
        icon: Plus,
        label: ["Add cell below", "Alt+click to add above"],
        shortcut: ["B", "A"],
        action: "add-cell",
      },
      {
        icon: Play,
        label: ["Run cell", "Run and select below"],
        shortcut: [
          [CmdOrCtrl, Enter],
          [Shift, Enter],
        ],
        action: "run",
        cellTypes: [CellType.CODE],
      },
      {
        icon: ChevronsUp,
        label: "Run all above",
        shortcut: [[AltOrOption, "A"]],
        action: "run-all-above",
      },
      {
        icon: ChevronsDown,
        label: "Run cell and below",
        shortcut: [[AltOrOption, "B"]],
        action: "run-cell-and-below",
      },
      {
        icon: ArrowUp,
        label: "Move up",
        shortcut: [[AltOrOption, ArrowUpIcon]],
        action: "move-up",
      },
      {
        icon: ArrowDown,
        label: "Move down",
        shortcut: [[AltOrOption, ArrowDownIcon]],
        action: "move-down",
      },
      {
        icon: Copy,
        label: ["Copy cell", "Alt+click to duplicate"],
        shortcut: ["C", "CV"],
        action: "copy-or-duplicate",
      },
      { icon: Scissors, label: "Cut cell", shortcut: "X", action: "cut-cell" },
      { icon: Trash2, label: "Delete cell", shortcut: "DD", action: "delete" },
      {
        icon: LayoutTemplate,
        label:
          cell.cell_type === CellType.CODE
            ? isInAppView
              ? "Remove all outputs from app view"
              : "Add all outputs to app view"
            : isInAppView
              ? "Remove from app view"
              : "Add to app view",
        action: "toggle-app-view",
        className: isInAppView
          ? "!text-[#ff4800] hover:!text-[#ff4800]"
          : undefined,
        separatorBefore: true,
      },
    ];

    return buttons.filter(
      (b) =>
        b.action !== "toggle-app-view" ||
        cell.cell_type !== CellType.CODE ||
        hasCodeOutputs,
    );
  }, [cell.cell_type, isInAppView, hasCodeOutputs]);

  const mentionCellActionButtons = useMemo<ActionButtonDefinition[]>(
    () => [{ icon: AtSign, label: "Mention cell in chat", shortcut: "I", action: "mention-cell" }],
    [],
  );

  // Right-aligned action button definitions (Edit metadata moved to context menu)
  const defaultRightActionButtons: ActionButtonDefinition[] = [];

  const metadataEditRightActionButtons: ActionButtonDefinition[] = [
    {
      icon: Check,
      label: "Apply changes",
      shortcut: [CmdOrCtrl, "Enter"],
      action: "save-metadata",
    },
    {
      icon: X,
      label: "Discard changes",
      shortcut: "Esc",
      action: "discard-metadata",
    },
  ];

  /** Leaves metadata edit mode without applying the local JSON draft. */
  const discardMetadataChanges = useCallback(() => {
    setIsMetadataEditingMode(false);
    setMetadataError(null);
    onEditingModeChange?.(cellIndex, false);
  }, [cellIndex, onEditingModeChange]);

  /** Starts editing the full cell JSON payload. */
  const beginMetadataEditing = useCallback(() => {
    setIsMetadataEditingMode(true);
    setLocalMetadata(JSON.stringify(cell, null, 2));
    setMetadataError(null);
    setIsEditingMode(false);
    onEditingModeChange?.(cellIndex, false);
  }, [cell, cellIndex, onEditingModeChange]);

  /** Parses and applies the edited cell JSON to the parent notebook. */
  const saveMetadataChanges = useCallback(() => {
    let parsedCell: unknown;

    try {
      parsedCell = JSON.parse(localMetadata);
    } catch (error) {
      console.error("Error parsing metadata JSON:", error);
      setMetadataError("Invalid JSON. Fix the syntax before saving.");
      return;
    }

    if (!isNotebookCell(parsedCell)) {
      setMetadataError(
        "Cell JSON must include a valid cell_type and string[] source.",
      );
      return;
    }

    onUpdateCellData?.(cellIndex, parsedCell);
    setMetadataError(null);
    setIsMetadataEditingMode(false);
    onEditingModeChange?.(cellIndex, false);
  }, [cellIndex, localMetadata, onEditingModeChange, onUpdateCellData]);

  /**
   * Handles metadata edit shortcuts before Monaco consumes them.
   * Escape discards the draft; Cmd/Ctrl+Enter applies it.
   */
  useEffect(() => {
    const container = cellContainerRef.current;
    if (!container || !isMetadataEditingMode) return;

    const handleMetadataEditorKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        discardMetadataChanges();
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        saveMetadataChanges();
      }
    };

    container.addEventListener("keydown", handleMetadataEditorKeyDown, true);

    return () => {
      container.removeEventListener(
        "keydown",
        handleMetadataEditorKeyDown,
        true,
      );
    };
  }, [discardMetadataChanges, isMetadataEditingMode, saveMetadataChanges]);

  /** Collapses the source array in the full-cell JSON editor by default. */
  const handleMetadataEditorMount = useCallback<OnMount>((monacoEditor) => {
    window.requestAnimationFrame(() => {
      const model = monacoEditor.getModel();
      if (!model) return;

      for (
        let lineNumber = 1;
        lineNumber <= model.getLineCount();
        lineNumber += 1
      ) {
        const line = model.getLineContent(lineNumber);
        if (!/^\s*"source"\s*:/.test(line)) continue;

        monacoEditor.trigger("orion", "editor.fold", {
          levels: 1,
          selectionLines: [lineNumber],
        });
        break;
      }
    });
  }, []);

  // Sync notebook source into the editor when the saved cell changes externally.
  // Skip while the user has unsaved local edits — parent updates (queued/running
  // status, other cells executing) replace the cell object and must not wipe typing.
  useEffect(() => {
    if (hasLocalChanges) return;
    const src = Array.isArray(cell.source) ? cell.source.join("") : "";
    setLocalSource(src);
  }, [cell.source, cellId, hasLocalChanges]);

  // Initialize visibility and collapse states from cell metadata
  useEffect(() => {
    const cellState = cell.metadata?.orion?.cellState;
    if (cellState) {
      setIsInputHidden(cellState.isInputHidden || false);
      setIsOutputHidden(cellState.isOutputHidden || false);
      setIsWholeCellHidden(cellState.isWholeCellHidden || false);
      setIsMuted(cellState.isMuted || false);
      setIsInputCollapsed(cellState.isInputCollapsed || false);
      setIsOutputCollapsed(cellState.isOutputCollapsed || false);
    }
  }, [cell.metadata]);

  /**
   * Debounced function to notify parent of changes
   * This ensures we don't call onCellModified on every keystroke
   */
  const notifyCellModified = useCallback(
    (source: string) => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }

      changeTimeoutRef.current = setTimeout(() => {
        if (onCellModified) {
          onCellModified(cellIndex, source);
        }
        if (onContentChange) {
          onContentChange(cellIndex, source);
        }
      }, 300); // Debounce for 300ms
    },
    [cellIndex, onCellModified, onContentChange],
  );

  /**
   * Handles changes to cell content in the editor
   */
  const handleCodeChange = useCallback(
    (value: string) => {
      // Only update if the value actually changed
      if (value !== localSource) {
        setLocalSource(value);

        // Only mark as changed and notify if not already changed
        if (!hasLocalChanges) {
          setHasLocalChanges(true);
          notifyCellModified(value);
        } else {
          // For subsequent edits, just notify without re-rendering
          notifyCellModified(value);
        }
      }
    },
    [localSource, hasLocalChanges, notifyCellModified],
  );

  /**
   * Applies markdown syntax to Monaco selections while keeping undo/redo native.
   */
  const applyMarkdownSyntax = useCallback(
    (action: MarkdownFormatAction, headingLevel: MarkdownHeadingLevel = 1) => {
      const markdownEditor = markdownEditorInstanceRef.current;
      const model = markdownEditor?.getModel();
      if (!markdownEditor || !model) return;

      const selections = markdownEditor.getSelections();
      if (!selections || selections.length === 0) return;

      const plansByRange = new Map<string, MarkdownEditPlan>();
      for (const selection of selections) {
        const plan = createMarkdownEditPlan(
          action,
          selection,
          model,
          headingLevel,
        );
        const rangeKey = [
          plan.range.startLineNumber,
          plan.range.startColumn,
          plan.range.endLineNumber,
          plan.range.endColumn,
        ].join(":");

        if (!plansByRange.has(rangeKey)) {
          plansByRange.set(rangeKey, plan);
        }
      }

      const plans = Array.from(plansByRange.values()).sort(
        (left, right) => left.originalStartOffset - right.originalStartOffset,
      );
      const edits: MonacoEditorApi.IIdentifiedSingleEditOperation[] = plans.map(
        (plan) => ({
          range: plan.range,
          text: plan.text,
          forceMoveMarkers: true,
        }),
      );

      let offsetDelta = 0;
      const nextSelectionOffsets = plans.map((plan) => {
        const replacementStartOffset = plan.originalStartOffset + offsetDelta;
        offsetDelta +=
          plan.text.length -
          (plan.originalEndOffset - plan.originalStartOffset);

        return {
          start: replacementStartOffset + plan.selectionStartOffset,
          end: replacementStartOffset + plan.selectionEndOffset,
        };
      });

      markdownEditor.pushUndoStop();
      markdownEditor.executeEdits("orion-markdown-toolbar", edits);
      markdownEditor.pushUndoStop();

      const updatedModel = markdownEditor.getModel();
      if (updatedModel) {
        markdownEditor.setSelections(
          nextSelectionOffsets.map(({ start, end }) =>
            createSelectionFromOffsets(updatedModel, start, end),
          ),
        );
      }
      markdownEditor.focus();

      if (action === "text-color") {
        window.requestAnimationFrame(() => {
          markdownEditor
            .getAction("editor.action.showOrFocusStandaloneColorPicker")
            ?.run();
        });
      }
    },
    [],
  );

  /** Toggles soft line wrapping for the active markdown Monaco editor. */
  const toggleMarkdownLineWrapping = useCallback(() => {
    setIsMarkdownLineWrappingEnabled((current) => !current);
    markdownEditorInstanceRef.current?.focus();
  }, []);

  /**
   * Called when the parent component needs the current value (usually when saving)
   * Allows the parent to access the latest state without constant updates
   */
  useEffect(() => {
    // Remove the old syncCell event listener since we're using direct refs now
    return () => {
      // Clear any pending timeouts
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
      if (hideToolbarTimeoutRef.current) {
        clearTimeout(hideToolbarTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Exits editing mode
   */
  const exitEditingMode = useCallback(() => {
    markdownEditorInstanceRef.current = null;
    shouldFocusMarkdownEditorRef.current = false;
    setIsEditingMode(false);
  }, []);

  /**
   * Handle clicks outside the markdown editor to save and exit edit mode.
   * Also handles keyboard shortcuts for navigation and cell state.
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cell.cell_type === CellType.MARKDOWN && // Only for markdown
        isEditingMode &&
        editorRef.current &&
        !editorRef.current.contains(event.target as Node)
      ) {
        exitEditingMode();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle escape key for markdown editing
      if (
        cell.cell_type === CellType.MARKDOWN &&
        isEditingMode &&
        event.key === "Escape"
      ) {
        exitEditingMode();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditingMode, exitEditingMode, cell.cell_type, isSelected]);

  /**
   * Handles changing the cell type
   */
  const handleCellTypeChange = (newType: CellType) => {
    if (newType !== cell.cell_type) {
      // Mark cell as changed
      setHasLocalChanges(true);

      // Notify parent of change - parent should handle the actual type change
      if (onCellAction) {
        onCellAction("change-type", cellIndex);
      }
    }
  };

  /**
   * Handles actions from the action bar
   */
  const handleAction = (action: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent cell selection

    if (action === "view-metadata") {
      beginMetadataEditing();
    } else if (action === "save-metadata") {
      saveMetadataChanges();
    } else if (action === "discard-metadata") {
      discardMetadataChanges();
    } else if (action === "mention-cell") {
      onMentionCell?.(cellIndex);
    } else if (onCellAction) {
      // Check if Alt/Option key is pressed for add cell action
      if (action === "add-cell" && (e.altKey || e.metaKey)) {
        onCellAction("add-cell-above", cellIndex);
      } else if (action === "copy-or-duplicate") {
        // Check if Alt/Option key is pressed for copy cell action
        if (e.altKey || e.metaKey) {
          onCellAction("duplicate-cell", cellIndex); // Duplicate cell (original behavior)
        } else {
          onCellAction("copy-cell", cellIndex); // Copy cell (new default behavior)
        }
      } else {
        onCellAction(action, cellIndex);
      }
    }
  };

  /**
   * Dispatches markdown context menu actions through the same default action
   * semantics as the cell header buttons.
   */
  const handleMarkdownContextMenuAction = useCallback(
    (action: string) => {
      if (!onCellAction) return;

      if (action === "copy-or-duplicate") {
        onCellAction("copy-cell", cellIndex);
        return;
      }

      onCellAction(action, cellIndex);
    },
    [cellIndex, onCellAction],
  );

  /**
   * Update cell state in metadata
   */
  const updateCellState = useCallback(
    (stateUpdates: Record<string, any>) => {
      if (onUpdateCellMetadata) {
        const updatedMetadata = {
          ...cell.metadata,
          orion: {
            ...cell.metadata?.orion,
            cellState: {
              ...cell.metadata?.orion?.cellState,
              ...stateUpdates,
            },
          },
        };
        onUpdateCellMetadata(cellIndex, updatedMetadata);
      }
    },
    [onUpdateCellMetadata, cell.metadata, cellIndex],
  );

  /**
   * Handle arrow key navigation for collapsing/expanding cell state
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement =
        document.activeElement instanceof Element
          ? document.activeElement
          : null;
      const isEditableTarget =
        isCellEditableKeyboardTarget(event.target) ||
        isCellEditableKeyboardTarget(activeElement);

      if (isEditableTarget) {
        return;
      }

      // Handle arrow keys for collapsing/expanding selected cell in navigation mode
      if (isSelected && !isEditingMode) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          setIsInputCollapsed(true);
          updateCellState({ isInputCollapsed: true });
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          setIsInputCollapsed(false);
          updateCellState({ isInputCollapsed: false });
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSelected, isEditingMode, updateCellState]);

  /**
   * Context menu handlers for cell visualization controls
   */
  const handleToggleInputHidden = () => {
    const newState = !isInputHidden;
    setIsInputHidden(newState);
    updateCellState({ isInputHidden: newState });
  };

  const handleToggleOutputHidden = () => {
    const newState = !isOutputHidden;
    setIsOutputHidden(newState);
    updateCellState({ isOutputHidden: newState });
  };

  /** Mutes a code cell by hiding it and converting it to raw type. */
  const handleMuteCell = () => {
    if (cell.cell_type !== CellType.CODE) return;
    // Mute is explicit: code -> raw and hidden
    setIsMuted(true);
    setIsWholeCellHidden(true);
    updateCellState({ isMuted: true, isWholeCellHidden: true });
    if (onCellAction) {
      onCellAction("mute-cell", cellIndex);
    }
  };

  const handleHideCell = () => {
    setIsWholeCellHidden(true);
    updateCellState({ isWholeCellHidden: true });
  };

  const handleUnhideCell = () => {
    setIsWholeCellHidden(false);
    updateCellState({ isWholeCellHidden: false });
  };

  /** Restores a muted cell by showing it and converting it back to code type. */
  const handleUnmuteCell = () => {
    // Unmute is explicit: raw-hidden muted cell -> code and visible
    setIsMuted(false);
    setIsWholeCellHidden(false);
    updateCellState({ isMuted: false, isWholeCellHidden: false });
    if (onCellAction) {
      onCellAction("unmute-cell", cellIndex);
    }
  };

  const handleEditMetadata = beginMetadataEditing;

  const handleClearOutputs = () => {
    if (onCellAction) {
      onCellAction("clear-outputs", cellIndex);
    }
  };

  const handleToggleAppView = useCallback(() => {
    onCellAction?.("toggle-app-view", cellIndex);
  }, [cellIndex, onCellAction]);

  const handleToggleOutputAppView = useCallback(
    (cellIdx: number, outputIdx: number) => {
      onCellAction?.(`toggle-output-app-view:${outputIdx}`, cellIdx);
    },
    [onCellAction],
  );

  /** Requests that the chat composer attach this specific cell output. */
  const handleMentionOutput = useCallback(
    (cellIdx: number, outputIdx: number) => {
      if (!notebookPath) return;

      const output = cell.outputs?.[outputIdx];
      window.dispatchEvent(
        new CustomEvent("orion:mention-notebook-output", {
          detail: {
            notebookPath,
            cellIndex: cellIdx,
            outputIndex: outputIdx,
            preview: output
              ? `Notebook cell ${cellIdx}, output ${outputIdx} (${output.output_type}).`
              : `Notebook cell ${cellIdx}, output ${outputIdx}.`,
          },
        }),
      );
    },
    [cell.outputs, notebookPath],
  );

  const handleClearSingleOutput = (cellIdx: number, outputIdx: number) => {
    if (onCellAction) {
      onCellAction(`clear-single-output:${outputIdx}`, cellIdx);
    }
  };

  /**
   * Write a registry clipboard payload to the browser clipboard.
   */
  const writeClipboardPayload = useCallback(
    async (payload: MimeClipboardPayload | null) => {
      if (!payload) return;
      if (payload.kind === "text") {
        await navigator.clipboard.writeText(payload.text);
        return;
      }

      const dataUrl = `data:${payload.mimeType};base64,${payload.data.replace(/\s/g, "")}`;
      const blob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((resultBlob) => {
            if (resultBlob) resolve(resultBlob);
            else reject(new Error("Canvas toBlob returned null"));
          }, "image/png");
        };
        img.onerror = () => reject(new Error("Image failed to load"));
        img.src = dataUrl;
      });

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
    },
    [],
  );

  const handleCopyOutput = async (_cellIdx: number, outputIdx: number) => {
    if (!cell.outputs || !cell.outputs[outputIdx]) return;
    try {
      const payload = mimeRegistry.toClipboard(cell.outputs[outputIdx]);
      await writeClipboardPayload(payload);
    } catch (error) {
      console.error("Failed to copy output:", error);
    }
  };

  const handleHideOutput = (cellIdx: number, outputIdx: number) => {
    if (onCellAction) {
      // Check if output is currently hidden to toggle appropriately
      const output = cell.outputs?.[outputIdx];
      const isCurrentlyHidden = output?.metadata?.orion?.hidden === true;

      if (isCurrentlyHidden) {
        onCellAction(`unhide-single-output:${outputIdx}`, cellIdx);
      } else {
        onCellAction(`hide-single-output:${outputIdx}`, cellIdx);
      }
    }
  };

  /** Clears all outputs for the cell. */
  const handleClearAllOutputs = (_cellIdx: number) => {
    if (onCellAction) {
      onCellAction("clear-outputs", cellIndex);
    }
  };

  /** Copies all outputs' content to the clipboard via registry payloads. */
  const handleCopyAllOutputs = async (_cellIdx: number) => {
    if (!cell.outputs || cell.outputs.length === 0) return;

    const parts: string[] = [];
    for (const output of cell.outputs) {
      const payload = mimeRegistry.toClipboard(output);
      if (!payload) {
        continue;
      }
      if (payload.kind === "text") {
        parts.push(payload.text);
      } else {
        parts.push(`[Image output: ${payload.mimeType}]`);
      }
    }

    if (parts.length > 0) {
      try {
        await navigator.clipboard.writeText(parts.join("\n"));
      } catch (error) {
        console.error("Failed to copy all outputs:", error);
      }
    }
  };

  /** Toggles visibility of all outputs for the cell. */
  const handleHideAllOutputs = (_cellIdx: number) => {
    handleToggleOutputHidden();
  };

  /** Toggles the collapsed state for a single output and persists it in output metadata. */
  const handleTogglePerOutputCollapse = useCallback(
    (outputIdx: number) => {
      if (!onCellAction) return;
      const nextCollapsed = !isOutputCollapsedAtIndex(outputIdx);
      onCellAction(
        `set-output-collapsed:${outputIdx}:${nextCollapsed}`,
        cellIndex,
      );
    },
    [cellIndex, isOutputCollapsedAtIndex, onCellAction],
  );

  /** Shows the output toolbar for the hovered output, cancelling any pending hide */
  const handleOutputMouseEnter = useCallback((idx: number) => {
    if (hideToolbarTimeoutRef.current) {
      clearTimeout(hideToolbarTimeoutRef.current);
    }
    setHoveredOutputIndex(idx);
  }, []);

  /** Schedules hiding the toolbar with a short delay so the user can move to it */
  const handleOutputMouseLeave = useCallback(() => {
    hideToolbarTimeoutRef.current = setTimeout(() => {
      setHoveredOutputIndex(null);
    }, 300);
  }, []);

  /** Cancels the hide when the mouse enters the toolbar itself */
  const handleToolbarMouseEnter = useCallback(() => {
    if (hideToolbarTimeoutRef.current) {
      clearTimeout(hideToolbarTimeoutRef.current);
    }
  }, []);

  /** Schedules hiding the toolbar when the mouse leaves it */
  const handleToolbarMouseLeave = useCallback(() => {
    hideToolbarTimeoutRef.current = setTimeout(() => {
      setHoveredOutputIndex(null);
    }, 300);
  }, []);

  const canCollapseOutput =
    outputScrollHeight > COLLAPSED_CONTENT_HEIGHT_DEFAULT;
  const isOutputCollapsedEffective = isOutputCollapsed && canCollapseOutput;
  const hasPlotlyOutputInCell = React.useMemo(() => {
    const outputs = cell.outputs ?? [];
    return outputs.some((output) => mimeRegistry.classify(output) === "plotly");
  }, [cell.outputs, mimeRegistry]);
  const shouldClampCollapsedOutputViewport =
    isOutputCollapsedEffective && !hasPlotlyOutputInCell;

  /** Saved hide state, plus global UI toggle — only applies to code cells (not markdown/raw). */
  const inputHiddenForDisplay =
    isInputHidden ||
    (cell.cell_type === CellType.CODE && !!presentationHideAllCellInputs);

  // If cell has a parse error, show an error banner instead of normal content
  if (parseError) {
    return (
      <div
        className="relative isolate notebook-cell"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Card
          className={cn(
            "overflow-hidden relative border-red-300 dark:border-red-700",
            isSelected && "ring-1 ring-blue-500 ring-opacity-70",
          )}
          onClick={(e) => onCellSelect?.(cellIndex, e)}
        >
          <div
            className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 h-9"
            data-notebook-export-remove
          >
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-medium text-red-700 dark:text-red-400">
              Corrupted Cell #{cellIndex}
            </span>
          </div>
          <CardContent className="p-3">
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">
              {parseError}
            </p>
            {localSource.trim() && (
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-40 text-muted-foreground whitespace-pre-wrap break-all">
                {localSource.length > 2000
                  ? localSource.slice(0, 2000) + "..."
                  : localSource}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // If cell is hidden, show clickable text to unhide it
  if (isWholeCellHidden) {
    // Legacy muted cells were marked via metadata.orion.cellType = "raw".
    const isLegacyMuted = (cell.metadata as any)?.orion?.cellType === "raw";
    const isMutedCell = isMuted || isLegacyMuted;

    return (
      <div
        className="relative isolate notebook-cell"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className="p-2 h-6 flex items-center text-left text-xs text-muted-foreground cursor-pointer hover:text-accent-foreground rounded-md w-fit"
          onClick={isMutedCell ? handleUnmuteCell : handleUnhideCell}
        >
          {isMutedCell
            ? `Click to unmute cell #${cellIndex}`
            : `Click to show hidden cell #${cellIndex}`}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cellContainerRef}
      className="relative isolate notebook-cell"
      tabIndex={-1}
      onMouseDownCapture={(event) =>
        onCellMouseDownCapture?.(cellIndex, event)
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main cell */}
      <Card
        className={cn(
          "overflow-hidden relative",
          isSelected && "ring-1 ring-blue-500 ring-opacity-70",
          effectiveVariant === "ghost" && "border-none bg-transparent shadow-none",
        )}
        style={{ zIndex: 1 }}
        onClick={(e) => onCellSelect?.(cellIndex, e)}
      >
        {effectiveVariant === "default" && (
          <CellContextMenu
            cellIndex={cellIndex}
            cellType={cell.cell_type}
            isInputCollapsed={isInputCollapsed}
            isOutputCollapsed={isOutputCollapsedEffective}
            isInputHidden={isInputHidden}
            isOutputHidden={isOutputHidden}
            isWholeCellHidden={isWholeCellHidden}
            isInAppView={isInAppView}
            canCollapseOutput={canCollapseOutput}
            canHideOutputs={hasCodeOutputs}
            onToggleInputCollapse={() => {
              const newState = !isInputCollapsed;
              setIsInputCollapsed(newState);
              updateCellState({ isInputCollapsed: newState });
            }}
            onToggleOutputCollapse={() => {
              if (!canCollapseOutput) return;
              const newState = !isOutputCollapsedEffective;
              setIsOutputCollapsed(newState);
              updateCellState({ isOutputCollapsed: newState });
            }}
            onToggleInputHidden={handleToggleInputHidden}
            onToggleOutputHidden={handleToggleOutputHidden}
            onMuteCell={handleMuteCell}
            onHideCell={handleHideCell}
            onEditMetadata={handleEditMetadata}
            onClearOutputs={handleClearOutputs}
            onToggleAppView={handleToggleAppView}
            onMarkdownAction={handleMarkdownContextMenuAction}
          >
            <div
              className="flex items-center px-1.5 py-0.5 bg-muted min-h-7 h-7"
              data-notebook-export-remove
            >
              <div className="flex items-center flex-1 justify-between min-h-0">
                <div className="flex items-center min-w-0">
                  <span className="text-muted-foreground text-[11px] tabular-nums mx-1 shrink-0">
                    {cellIndex}
                  </span>
                  {isInputCollapsed ? (
                    <ChevronsUpDown
                      className="h-3.5 w-3.5 mr-1 shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent triggering cell selection
                        const newState = !isInputCollapsed;
                        setIsInputCollapsed(newState);
                        updateCellState({ isInputCollapsed: newState });
                      }}
                    />
                  ) : (
                    <ChevronsDownUp
                      className="h-3.5 w-3.5 mr-1 shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent triggering cell selection
                        const newState = !isInputCollapsed;
                        setIsInputCollapsed(newState);
                        updateCellState({ isInputCollapsed: newState });
                      }}
                    />
                  )}
                  <CellTypeCombobox
                    cellType={cell.cell_type}
                    hasLocalChanges={hasLocalChanges}
                    onCellTypeChange={handleCellTypeChange}
                  />

                  {(isSelected || isHovered) && !isMetadataEditingMode && (
                    <>
                      <Separator
                        orientation="vertical"
                        className="mr-1 h-4 bg-cell-separator-foreground"
                      />
                      <TooltipProvider delayDuration={300}>
                        <CellHeaderActionButtons
                          actionButtons={actionButtons}
                          onAction={handleAction}
                          cellType={cell.cell_type}
                        />
                      </TooltipProvider>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!isMetadataEditingMode && hasMentionableEditorSelection && (
                    <div className="mr-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                      <span>Mention selection</span>
                      <kbd className="inline-flex h-4 min-h-4 items-center gap-0.5 rounded border border-border bg-background px-1 font-mono text-[10px] font-medium">
                        <CmdOrCtrl className="h-2.5 w-2.5" />
                        <span>I</span>
                      </kbd>
                    </div>
                  )}
                  {!isMetadataEditingMode && (
                    <TooltipProvider delayDuration={300}>
                      <CellHeaderActionButtons
                        actionButtons={mentionCellActionButtons}
                        onAction={handleAction}
                        cellType={cell.cell_type}
                      />
                    </TooltipProvider>
                  )}
                  {/* Status indicators and execution info */}
                  {!isMetadataEditingMode && getExecutionInfo() && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <StatusIndicator status={getExecutionInfo()!.status} />
                        <ExecutionInfo
                          lastExecuted={getExecutionInfo()!.lastExecuted}
                          duration={getExecutionInfo()!.duration}
                        />
                      </div>
                    </>
                  )}
                  <TooltipProvider delayDuration={300}>
                    <CellHeaderActionButtons
                      actionButtons={
                        isMetadataEditingMode
                          ? metadataEditRightActionButtons
                          : defaultRightActionButtons
                      }
                      onAction={handleAction}
                      cellType={cell.cell_type}
                    />
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </CellContextMenu>
        )}

        <CardContent className="p-0">
          {validationIssue ? (
            <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{validationIssue}</span>
            </div>
          ) : null}
          {isMetadataEditingMode ? (
            <div className="border-t border-muted">
              {effectiveVariant !== "default" ? (
                <div
                  className="flex h-7 min-h-7 items-center justify-end bg-muted px-1.5 py-0.5"
                  data-notebook-export-remove
                >
                  <TooltipProvider delayDuration={300}>
                    <CellHeaderActionButtons
                      actionButtons={metadataEditRightActionButtons}
                      onAction={handleAction}
                      cellType={cell.cell_type}
                    />
                  </TooltipProvider>
                </div>
              ) : null}
              <MonacoEditor
                value={localMetadata}
                onChange={(value) => {
                  setLocalMetadata(value);
                  setMetadataError(null);
                }}
                language="json"
                height="auto"
                onMount={handleMetadataEditorMount}
                onEditorFocus={() => onEditingModeChange?.(cellIndex, true)}
                onEditorBlur={() => onEditingModeChange?.(cellIndex, false)}
              />
              {metadataError ? (
                <div className="px-3 py-2 text-xs text-destructive">
                  {metadataError}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <CellContextMenu
                cellIndex={cellIndex}
                cellType={cell.cell_type}
                isInputCollapsed={isInputCollapsed}
                isOutputCollapsed={isOutputCollapsedEffective}
                isInputHidden={isInputHidden}
                isOutputHidden={isOutputHidden}
                isWholeCellHidden={isWholeCellHidden}
                isInAppView={isInAppView}
                canCollapseOutput={canCollapseOutput}
                canHideOutputs={hasCodeOutputs}
                onToggleInputCollapse={() => {
                  const newState = !isInputCollapsed;
                  setIsInputCollapsed(newState);
                  updateCellState({ isInputCollapsed: newState });
                }}
                onToggleOutputCollapse={() => {
                  if (!canCollapseOutput) return;
                  const newState = !isOutputCollapsedEffective;
                  setIsOutputCollapsed(newState);
                  updateCellState({ isOutputCollapsed: newState });
                }}
                onToggleInputHidden={handleToggleInputHidden}
                onToggleOutputHidden={handleToggleOutputHidden}
                onMuteCell={handleMuteCell}
                onHideCell={handleHideCell}
                onEditMetadata={handleEditMetadata}
                onClearOutputs={handleClearOutputs}
                onToggleAppView={handleToggleAppView}
                onMarkdownAction={handleMarkdownContextMenuAction}
              >
                {cell.cell_type === CellType.MARKDOWN &&
                  !inputHiddenForDisplay && (
                    <div>
                      {isEditingMode ? (
                        <div
                          ref={editorRef}
                          className="jp-InputArea-editor min-w-0 max-w-full overflow-x-hidden border-t border-muted bg-transparent"
                        >
                          <MarkdownFormattingToolbar
                            onFormat={applyMarkdownSyntax}
                            onToggleLineWrapping={toggleMarkdownLineWrapping}
                            onOpenColorPicker={() =>
                              applyMarkdownSyntax("text-color")
                            }
                            isLineWrappingEnabled={
                              isMarkdownLineWrappingEnabled
                            }
                          />
                          <MonacoEditor
                            value={localSource}
                            onChange={handleCodeChange}
                            language="markdown"
                            height="auto"
                            minHeight={80}
                            className="min-w-0 max-w-full"
                            referencePath={notebookPath}
                            referenceNotebookCellIndex={cellIndex}
                            wordWrapOverride={
                              isMarkdownLineWrappingEnabled ? "on" : "off"
                            }
                            suppressHorizontalScrollbar={
                              isMarkdownLineWrappingEnabled
                            }
                            onEditorFocus={() => setIsEditingMode(true)}
                            onMount={(editor) => {
                              markdownEditorInstanceRef.current = editor;
                              registerMentionSelectionTracker(editor);
                              editor.updateOptions({
                                colorDecorators: true,
                                colorDecoratorsActivatedOn: "clickAndHover",
                              });
                              if (shouldFocusMarkdownEditorRef.current) {
                                window.requestAnimationFrame(() => {
                                  focusMarkdownEditor(editor);
                                });
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          ref={markdownRef}
                          onDoubleClick={() => beginMarkdownEditing()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isEditingMode) {
                              e.preventDefault();
                              beginMarkdownEditing({ placeCursorAtStart: true });
                            }
                          }}
                          tabIndex={0}
                          className="jp-RenderedHTMLCommon cursor-text ml-4 p-2"
                        >
                          <MarkdownRenderer source={localSource} />
                        </div>
                      )}
                    </div>
                  )}
              </CellContextMenu>

              {cell.cell_type === CellType.RAW && !inputHiddenForDisplay && (
                <div className="border-t border-muted p-4 font-mono text-sm whitespace-pre-wrap">
                  {localSource}
                </div>
              )}

              {cell.cell_type === CellType.CODE && (
                <>
                  {!inputHiddenForDisplay && (
                    <div
                      ref={contentRef}
                      className={cn(
                        "jp-InputArea-editor border-t border-muted relative dark:bg-[#1E1E1E] bg-[#F7F7F7]", // TODO: Get the background color from the theme dynamically
                        isInputCollapsed &&
                        contentScrollHeight >
                        COLLAPSED_CONTENT_HEIGHT_DEFAULT &&
                        "p-2 h-48 overflow-y-auto shadow-inner",
                      )}
                      style={
                        isInputCollapsed &&
                          contentScrollHeight > COLLAPSED_CONTENT_HEIGHT_DEFAULT
                          ? {
                            boxShadow:
                              theme === "dark"
                                ? "inset 0 0 8px rgba(0, 0, 0, 0.6)"
                                : "inset 0 0 8px rgba(0, 0, 0, 0.3)",
                          }
                          : {}
                      }
                    >
                      <MonacoEditor
                        value={localSource}
                        onChange={handleCodeChange}
                        language="python"
                        height="auto"
                        referencePath={notebookPath}
                        referenceNotebookCellIndex={cellIndex}
                        onEditorFocus={() => setIsEditingMode(true)}
                        onEditorBlur={() => setIsEditingMode(false)}
                        onMount={(editor) => {
                          monacoEditorInstanceRef.current = editor;
                          registerMentionSelectionTracker(editor);
                        }}
                      />
                      <CellOutputToolbar
                        isVisible={
                          hoveredOutputIndex !== null &&
                          !isOutputHidden &&
                          !!cell.outputs?.length
                        }
                        cellIndex={cellIndex}
                        onClearOutput={handleClearAllOutputs}
                        onCopyOutput={handleCopyAllOutputs}
                        onHideOutput={handleHideAllOutputs}
                        onMouseEnter={handleToolbarMouseEnter}
                        onMouseLeave={handleToolbarMouseLeave}
                      />
                    </div>
                  )}
                  {isOutputHidden &&
                    cell.outputs &&
                    cell.outputs.length > 0 && (
                      <div
                        className="px-3 py-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors border-t border-muted"
                        onClick={handleToggleOutputHidden}
                      >
                        Output hidden — click to show
                      </div>
                    )}
                  {!isOutputHidden &&
                    cell.outputs &&
                    cell.outputs.length > 0 && (
                      <div className="relative">
                        <div
                          ref={outputContentRef}
                          className={cn(
                            "relative",
                            shouldClampCollapsedOutputViewport &&
                            "p-2 max-h-48 overflow-y-auto",
                          )}
                        >
                          {cell.outputs.map((output, idx) => (
                            <React.Fragment key={idx}>
                              {idx > 0 && <Separator />}
                              <div
                                id={`output-${cellIndex}-${idx}`}
                                className="jp-OutputArea-output"
                                onMouseEnter={() => handleOutputMouseEnter(idx)}
                                onMouseLeave={handleOutputMouseLeave}
                              >
                                <OutputRenderer
                                  output={output}
                                  notebookMetadata={notebookMetadata}
                                  cellIndex={cellIndex}
                                  outputIndex={idx}
                                  onClearOutput={handleClearSingleOutput}
                                  onCopyOutput={handleCopyOutput}
                                  onHideOutput={handleHideOutput}
                                  onMentionOutput={handleMentionOutput}
                                  onToggleOutputAppView={
                                    handleToggleOutputAppView
                                  }
                                  onOrionUiStateChange={onOrionUiStateChange}
                                  onOrionUiAction={onOrionUiAction}
                                  isInAppView={
                                    isNotebookOutputInAppView(cell, idx)
                                  }
                                  isCollapsed={isOutputCollapsedAtIndex(idx)}
                                  onToggleCollapse={() =>
                                    handleTogglePerOutputCollapse(idx)
                                  }
                                  scrollCollapsedToEnd={
                                    output.output_type === OutputType.ERROR &&
                                    getOutputTextLength(output) >
                                    TEXT_OUTPUT_AUTO_COLLAPSE_THRESHOLD &&
                                    isOutputCollapsedAtIndex(idx)
                                  }
                                />
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                        {shouldClampCollapsedOutputViewport &&
                          outputScrollEdges.top && (
                            <div
                              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-background to-transparent"
                              aria-hidden
                            />
                          )}
                        {shouldClampCollapsedOutputViewport &&
                          outputScrollEdges.bottom && (
                            <div
                              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-background to-transparent"
                              aria-hidden
                            />
                          )}
                      </div>
                    )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Export memoized version of the component
export const NotebookCell = memo(NotebookCellComponent, (prev, next) => {
  const sameCellRef = prev.cell === next.cell;
  const sameNotebookMetadata = prev.notebookMetadata === next.notebookMetadata;
  const sameNotebookPath = prev.notebookPath === next.notebookPath;
  const sameIndex = prev.cellIndex === next.cellIndex;
  const sameSelected = prev.isSelected === next.isSelected;
  const sameVariant = prev.variant === next.variant;
  const sameValidationIssue = prev.validationIssue === next.validationIssue;
  const sameMentionHandler = prev.onMentionCell === next.onMentionCell;
  const sameOrionUiStateHandler =
    prev.onOrionUiStateChange === next.onOrionUiStateChange;
  const sameOrionUiActionHandler =
    prev.onOrionUiAction === next.onOrionUiAction;
  const samePresentationHide =
    prev.presentationHideAllCellInputs === next.presentationHideAllCellInputs;
  return (
    sameCellRef &&
    sameNotebookMetadata &&
    sameNotebookPath &&
    sameIndex &&
    sameSelected &&
    sameVariant &&
    sameValidationIssue &&
    sameMentionHandler &&
    sameOrionUiStateHandler &&
    sameOrionUiActionHandler &&
    samePresentationHide
  );
});
