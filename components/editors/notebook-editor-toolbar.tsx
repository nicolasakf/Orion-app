"use client";

import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react";

import { AltOrOption, CmdOrCtrl, Enter } from "@/components/common/keyboard-icons";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { NotebookViewToggle } from "@/components/notebook/notebook-view-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NOTEBOOK_EXPORT_EVENT_NAME,
  NOTEBOOK_EXPORT_OPTIONS,
  type NotebookExportEventDetail,
  type NotebookExportFormat,
} from "@/lib/notebook/notebook-export";
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

export interface NotebookEditorToolbarProps {
  currentKernel: KernelInfo | null;
  kernelStatus: KernelStatus;
  isRunning: boolean;
  presentationHideAllCellInputs: boolean;
  onRunAll: (stopOnError?: boolean) => void;
  onStopKernel: () => void | Promise<void>;
  onRestartKernel: () => void | Promise<void>;
  onRestartAndRunAll: () => void | Promise<void>;
  onTogglePresentationHideAllCellInputs: () => void;
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
  onRestartAndRunAll,
  onTogglePresentationHideAllCellInputs,
}: NotebookEditorToolbarProps) {
  const canRun =
    Boolean(currentKernel) && kernelStatus === "connected" && !isRunning;
  const canControlKernel =
    Boolean(currentKernel) &&
    kernelStatus !== "disconnected" &&
    kernelStatus !== "connecting";

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div
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
                onClick={() => onRunAll(true)}
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-4 shrink-0 !rounded-none border-0 bg-background px-0 shadow-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:z-10"
                disabled={!canRun}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => onRunAll(true)}>
                <Play className="h-4 w-4 mr-2" />
                Run All Cells
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRunAll(false)}>
                <Play className="h-4 w-4 mr-2 text-yellow-500" />
                Run All Cells (Ignore Errors)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
        onClick={onRestartAndRunAll}
        disabled={!canControlKernel || isRunning}
        toolTipLabel="Restart Kernel and Run All Cells"
      >
        <RefreshCw className="h-4 w-4" />
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
          <ToolbarButton toolTipLabel="Export Notebook">
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
      <NotebookViewToggle />
    </>
  );
}
