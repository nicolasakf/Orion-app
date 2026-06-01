"use client";

import React from "react";
import {
  Copy,
  EyeOff,
  LayoutTemplate,
  Maximize2,
  Trash2,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { NotebookOutputPresentationMenu } from "@/components/notebook/renderers/types";
import { cn } from "@/lib/utils";

interface OutputContextMenuProps {
  children: React.ReactNode;
  cellIndex: number;
  outputIndex: number;
  onClearOutput: (cellIndex: number, outputIndex: number) => void;
  onCopyOutput: (cellIndex: number, outputIndex: number) => void;
  onHideOutput: (cellIndex: number, outputIndex: number) => void;
  onToggleAppView?: (cellIndex: number, outputIndex: number) => void;
  isInAppView?: boolean;
  /** When provided, shows "Open in full screen" option */
  onOpenFullScreen?: () => void;
  /** When provided, shows a collapse/expand toggle option (for text outputs) */
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  /** When options has more than one entry, shows a “Presentation” submenu. */
  presentationMenu?: NotebookOutputPresentationMenu | null;
}

/**
 * Context menu for individual cell outputs
 * Appears when right-clicking on output content (excluding data tables and plotly charts)
 */
export function OutputContextMenu({
  children,
  cellIndex,
  outputIndex,
  onClearOutput,
  onCopyOutput,
  onHideOutput,
  onToggleAppView,
  isInAppView = false,
  onOpenFullScreen,
  onToggleCollapse,
  isCollapsed,
  presentationMenu,
}: OutputContextMenuProps) {
  const showPresentationSubmenu =
    presentationMenu && presentationMenu.options.length > 1;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {showPresentationSubmenu && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <LayoutTemplate className="mr-2 h-4 w-4" />
                Presentation
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-max">
                <ContextMenuRadioGroup
                  value={presentationMenu.value}
                  onValueChange={presentationMenu.onValueChange}
                >
                  {presentationMenu.options.map((opt) => (
                    <ContextMenuRadioItem
                      key={opt.mimeType}
                      value={opt.mimeType}
                    >
                      <span className="whitespace-nowrap" title={opt.mimeType}>
                        {opt.label}
                      </span>
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        )}
        {(onOpenFullScreen || onToggleCollapse) && (
          <>
            {onOpenFullScreen && (
              <ContextMenuItem onClick={onOpenFullScreen}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Open in full screen
              </ContextMenuItem>
            )}
            {onToggleCollapse && (
              <ContextMenuItem onClick={onToggleCollapse}>
                {isCollapsed ? (
                  <>
                    <ChevronsUpDown className="mr-2 h-4 w-4" />
                    Expand Output
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="mr-2 h-4 w-4" />
                    Collapse Output
                  </>
                )}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={() => onCopyOutput(cellIndex, outputIndex)}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Output
        </ContextMenuItem>

        {onToggleAppView ? (
          <ContextMenuItem
            onClick={() => onToggleAppView(cellIndex, outputIndex)}
          >
            <LayoutTemplate
              className={cn("mr-2 h-4 w-4", isInAppView && "!text-[#ff4800]")}
            />
            {isInAppView ? "Remove from App View" : "Add to App View"}
          </ContextMenuItem>
        ) : null}

        <ContextMenuItem onClick={() => onHideOutput(cellIndex, outputIndex)}>
          <EyeOff className="mr-2 h-4 w-4" />
          Hide Output
        </ContextMenuItem>

        <ContextMenuItem onClick={() => onClearOutput(cellIndex, outputIndex)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear Output
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
