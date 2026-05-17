"use client";

import React from "react";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Copy,
  Eye,
  EyeOff,
  ChevronsDownUp,
  ChevronsUpDown,
  LayoutTemplate,
  Plus,
  Power,
  Scissors,
  Trash2,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CellType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MarkdownContextMenuAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action: string;
}

interface CellContextMenuProps {
  children: React.ReactNode;
  cellIndex: number;
  cellType: CellType;
  isInputCollapsed: boolean;
  isOutputCollapsed: boolean;
  isInputHidden: boolean;
  isOutputHidden: boolean;
  isWholeCellHidden: boolean;
  isInAppView: boolean;
  canCollapseOutput?: boolean;
  /**
   * False when a code cell has no outputs. Gates hide/clear output actions and, for code cells only, Add to App View.
   */
  canHideOutputs?: boolean;
  onToggleInputCollapse: () => void;
  onToggleOutputCollapse: () => void;
  onToggleInputHidden: () => void;
  onToggleOutputHidden: () => void;
  onMuteCell: () => void;
  onHideCell: () => void;
  onEditMetadata: () => void;
  onClearOutputs: () => void;
  onToggleAppView: () => void;
  onMarkdownAction?: (action: string) => void;
}

const markdownContextMenuActions: MarkdownContextMenuAction[] = [
  { icon: Plus, label: "Add cell below", action: "add-cell" },
  { icon: ArrowUp, label: "Move up", action: "move-up" },
  { icon: ArrowDown, label: "Move down", action: "move-down" },
  { icon: Copy, label: "Copy cell", action: "copy-or-duplicate" },
  { icon: Scissors, label: "Cut cell", action: "cut-cell" },
  { icon: Trash2, label: "Delete cell", action: "delete" },
];

/**
 * Context menu for cell visualization controls
 * Appears when right-clicking on a cell header
 */
export function CellContextMenu({
  children,
  cellIndex,
  cellType,
  isInputCollapsed,
  isOutputCollapsed,
  isInputHidden,
  isOutputHidden,
  isWholeCellHidden,
  isInAppView,
  canCollapseOutput = true,
  canHideOutputs = true,
  onToggleInputCollapse,
  onToggleOutputCollapse,
  onToggleInputHidden,
  onToggleOutputHidden,
  onMuteCell,
  onHideCell,
  onEditMetadata,
  onClearOutputs,
  onToggleAppView,
  onMarkdownAction,
}: CellContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {cellType === CellType.MARKDOWN && onMarkdownAction && (
          <>
            <TooltipProvider delayDuration={300}>
              <div className="flex w-full items-center justify-center gap-1 px-1 py-1">
                {markdownContextMenuActions.map((menuAction) => {
                  const Icon = menuAction.icon;

                  return (
                    <Tooltip key={menuAction.action}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={menuAction.label}
                          className="corner-squircle flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                          onClick={() => onMarkdownAction(menuAction.action)}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipPortal>
                        <TooltipContent side="top" className="z-[100] px-1.5">
                          <p className="text-xs">{menuAction.label}</p>
                        </TooltipContent>
                      </TooltipPortal>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
            <ContextMenuSeparator />
          </>
        )}

        {/* Whole Cell Controls */}
        {cellType === CellType.CODE && (
          <ContextMenuItem onClick={onMuteCell}>
            <Power className="mr-2 h-4 w-4" />
            Mute Cell
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={onHideCell}>
          <EyeOff className="mr-2 h-4 w-4" />
          Hide Cell
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onToggleAppView}
          disabled={cellType === CellType.CODE && !canHideOutputs}
        >
          <LayoutTemplate
            className={cn("mr-2 h-4 w-4", isInAppView && "!text-[#ff4800]")}
          />
          {isInAppView ? "Remove from App View" : "Add to App View"}
        </ContextMenuItem>

        <ContextMenuSeparator />
        {cellType === CellType.CODE && (
          <>
            {/* Input Visualization */}
            <ContextMenuItem onClick={onToggleInputCollapse}>
              {isInputCollapsed ? (
                <ChevronsUpDown className="mr-2 h-4 w-4" />
              ) : (
                <ChevronsDownUp className="mr-2 h-4 w-4" />
              )}
              {isInputCollapsed ? "Expand" : "Collapse"} Input
            </ContextMenuItem>
            <ContextMenuItem onClick={onToggleInputHidden}>
              {isInputHidden ? (
                <Eye className="mr-2 h-4 w-4" />
              ) : (
                <EyeOff className="mr-2 h-4 w-4" />
              )}
              {isInputHidden ? "Show" : "Hide"} Input
            </ContextMenuItem>

            <ContextMenuSeparator />

            {/* Output Visualization - Only show for code cells */}
            <ContextMenuItem
              onClick={onToggleOutputCollapse}
              disabled={!canCollapseOutput}
            >
              {isOutputCollapsed ? (
                <ChevronsUpDown className="mr-2 h-4 w-4" />
              ) : (
                <ChevronsDownUp className="mr-2 h-4 w-4" />
              )}
              {isOutputCollapsed ? "Expand" : "Collapse"} Outputs
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onToggleOutputHidden}
              disabled={!canHideOutputs}
            >
              {isOutputHidden ? (
                <Eye className="mr-2 h-4 w-4" />
              ) : (
                <EyeOff className="mr-2 h-4 w-4" />
              )}
              {isOutputHidden ? "Show" : "Hide"} Outputs
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onClearOutputs}
              disabled={!canHideOutputs}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Outputs
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        <ContextMenuItem onClick={onEditMetadata}>
          <Braces className="mr-2 h-4 w-4" />
          Edit cell metadata
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
