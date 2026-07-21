"use client";

import * as React from "react";
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  Play,
  RotateCcw,
  Square,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { AltOrOption, CmdOrCtrl, Enter } from "@/components/common/keyboard-icons";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { NotebookViewToggle } from "@/components/notebook/notebook-view-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  NOTEBOOK_EXPORT_EVENT_NAME,
  NOTEBOOK_EXPORT_OPTIONS,
  type NotebookExportEventDetail,
  type NotebookExportFormat,
} from "@/lib/notebook/notebook-export";
import { NOTEBOOK_PUBLISH_EVENT_NAME } from "@/lib/cloud/publishing";
import {
  RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
  SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
  type RunAllStoppedOnErrorEventDetail,
  type RunAllTriggerSource,
} from "@/lib/notebook/notebook-execution-events";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { KernelInfo, KernelStatus } from "@/lib/types";

/** Dispatches a notebook export request to the mounted notebook editor. */
function dispatchNotebookExport(format: NotebookExportFormat): void {
  window.dispatchEvent(
    new CustomEvent<NotebookExportEventDetail>(NOTEBOOK_EXPORT_EVENT_NAME, {
      detail: { format },
    }),
  );
}

/** Dispatches a notebook publish request to the mounted notebook editor. */
function dispatchNotebookPublish(): void {
  window.dispatchEvent(new CustomEvent(NOTEBOOK_PUBLISH_EVENT_NAME));
}

type GoToErrorPopoverState = {
  cellIndex: number;
};

export interface NotebookEditorToolbarProps {
  currentKernel: KernelInfo | null;
  kernelStatus: KernelStatus;
  isRunning: boolean;
  presentationHideAllCellInputs: boolean;
  onRunAll: (stopOnError?: boolean, triggerSource?: RunAllTriggerSource) => void;
  onStopKernel: () => void | Promise<void>;
  onRestartKernel: () => void | Promise<void>;
  onTogglePresentationHideAllCellInputs: () => void;
}

/** Popover content that scrolls to the first run-all error cell. */
function GoToErrorPopoverContent({
  cellIndex,
  onDismiss,
  align = "start",
}: {
  cellIndex: number;
  onDismiss: () => void;
  align?: "start" | "center";
}) {
  const handleGoToError = React.useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME, {
        detail: { cellIndex },
      }),
    );
    onDismiss();
  }, [cellIndex, onDismiss]);

  return (
    <PopoverContent
      side="bottom"
      align={align}
      className="w-auto p-1"
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive/80 hover:bg-transparent"
        onClick={handleGoToError}
      >
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        Go to error
      </Button>
    </PopoverContent>
  );
}

/** Toolbar controls that only apply to the notebook editor. */
export function NotebookEditorToolbar({
  currentKernel,
  kernelStatus,
  isRunning,
  presentationHideAllCellInputs,
  onRunAll,
  onStopKernel,
  onRestartKernel,
  onTogglePresentationHideAllCellInputs,
}: NotebookEditorToolbarProps) {
  const [goToErrorState, setGoToErrorState] =
    React.useState<GoToErrorPopoverState | null>(null);
  const runAllSplitRef = React.useRef<HTMLDivElement>(null);
  const runAllMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [runAllMenuAlignOffset, setRunAllMenuAlignOffset] = React.useState(0);

  const canRun =
    Boolean(currentKernel) &&
    kernelStatus !== "disconnected" &&
    kernelStatus !== "connecting" &&
    !isRunning;
  const canControlKernel =
    Boolean(currentKernel) &&
    kernelStatus !== "disconnected" &&
    kernelStatus !== "connecting";

  const dismissGoToError = React.useCallback(() => {
    setGoToErrorState(null);
  }, []);

  const handleRunAllClick = React.useCallback(
    (stopOnError: boolean) => {
      dismissGoToError();
      if (stopOnError) {
        onRunAll(true, "run-all");
      } else {
        onRunAll(false);
      }
    },
    [dismissGoToError, onRunAll],
  );

  /** Aligns the run-all menu's left edge with the primary run button in the split control. */
  const syncRunAllMenuAlignOffset = React.useCallback(() => {
    const group = runAllSplitRef.current;
    const trigger = runAllMenuTriggerRef.current;
    if (!group || !trigger) return;
    setRunAllMenuAlignOffset(
      group.getBoundingClientRect().left - trigger.getBoundingClientRect().left,
    );
  }, []);

  const handleRestartAndRunAll = React.useCallback(async () => {
    dismissGoToError();
    await onRestartKernel();
    handleRunAllClick(true);
  }, [dismissGoToError, handleRunAllClick, onRestartKernel]);

  React.useEffect(() => {
    const handleRunAllStoppedOnError = (event: Event) => {
      const detail = (event as CustomEvent<RunAllStoppedOnErrorEventDetail>)
        .detail;
      if (detail.triggerSource !== "run-all") {
        return;
      }
      setGoToErrorState({
        cellIndex: detail.cellIndex,
      });
    };

    window.addEventListener(
      RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
      handleRunAllStoppedOnError as EventListener,
    );

    return () => {
      window.removeEventListener(
        RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
        handleRunAllStoppedOnError as EventListener,
      );
    };
  }, []);

  const goToErrorOpen = goToErrorState !== null;

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Popover
          open={goToErrorOpen}
          onOpenChange={(open) => {
            if (!open) dismissGoToError();
          }}
        >
          <PopoverAnchor asChild>
            <div
              ref={runAllSplitRef}
              role="group"
              aria-label="Run all cells"
              className="inline-flex h-8 overflow-hidden rounded-md border border-border/50 bg-background shadow-sm"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-7 shrink-0 !rounded-none border-0 border-e border-border/50 bg-background px-0 shadow-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:z-10"
                    onClick={() => handleRunAllClick(true)}
                    disabled={!canRun}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center">
                    <p>Run All Cells</p>
                    <kbd className="pointer-events-none ml-2 inline-flex shrink-0 flex-nowrap h-5 min-h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[12px] font-medium text-muted-foreground opacity-100">
                      <CmdOrCtrl className="h-3 w-3" />
                      <AltOrOption className="h-3 w-3" />
                      <Enter className="h-3 w-3" />
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>

              <DropdownMenu
                onOpenChange={(open) => {
                  if (open) syncRunAllMenuAlignOffset();
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    ref={runAllMenuTriggerRef}
                    variant="outline"
                    size="icon"
                    className="h-8 w-4 shrink-0 !rounded-none border-0 bg-background px-0 shadow-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:z-10"
                    disabled={!canRun}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  alignOffset={runAllMenuAlignOffset}
                  className="w-56"
                >
                  <DropdownMenuItem onClick={() => handleRunAllClick(true)}>
                    <Play className="h-4 w-4 mr-2" />
                    Run All Cells
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRunAllClick(false)}>
                    <Play className="h-4 w-4 mr-2 text-yellow-500" />
                    Run All Cells (Ignore Errors)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void handleRestartAndRunAll()}
                    disabled={!canControlKernel}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restart Kernel and Run All Cells
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </PopoverAnchor>
          {goToErrorState ? (
            <GoToErrorPopoverContent
              cellIndex={goToErrorState.cellIndex}
              onDismiss={dismissGoToError}
            />
          ) : null}
        </Popover>
      </TooltipProvider>
      <ToolbarButton
        onClick={onStopKernel}
        disabled={!canControlKernel}
        toolTipLabel="Interrupt Kernel"
        toolTipShortcut={[[AltOrOption, "Esc"]]}
      >
        <Square className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={onRestartKernel}
        disabled={!canControlKernel}
        toolTipLabel="Restart Kernel"
      >
        <RotateCcw className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={onTogglePresentationHideAllCellInputs}
        aria-pressed={presentationHideAllCellInputs}
        className="bg-transparent hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
        toolTipLabel={
          presentationHideAllCellInputs ? "Show cell inputs" : "Hide cell inputs"
        }
        toolTipShortcut={[[AltOrOption, "O"]]}
      >
        {presentationHideAllCellInputs ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </ToolbarButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarButton toolTipLabel="Export notebook">
            <Download className="h-4 w-4" />
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {NOTEBOOK_EXPORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.format}
              onClick={() => dispatchNotebookExport(option.format)}
            >
              {option.format === "pdf" || option.format === "latex" ? (
                <FileCode className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarButton onClick={dispatchNotebookPublish} toolTipLabel="Publish notebook">
        <UploadCloud className="h-4 w-4" />
      </ToolbarButton>
      <NotebookViewToggle />
    </>
  );
}
