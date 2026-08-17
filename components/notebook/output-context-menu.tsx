"use client";

import React from "react";
import {
  AtSign,
  Copy,
  EyeOff,
  FileCode2,
  LayoutTemplate,
  Maximize2,
  Trash2,
  ChevronsDownUp,
  ChevronsUpDown,
  X,
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
  onClearOutput?: (cellIndex: number, outputIndex: number) => void;
  onCopyOutput?: (cellIndex: number, outputIndex: number) => void;
  onHideOutput?: (cellIndex: number, outputIndex: number) => void;
  onMentionOutput?: (cellIndex: number, outputIndex: number) => void;
  /** Opens the output's source cell in Notebook View. */
  onGoToSource?: (cellIndex: number) => void;
  onToggleAppView?: (cellIndex: number, outputIndex: number) => void;
  isInAppView?: boolean;
  /** When true, the remove action label is shortened for Business View. */
  businessMode?: boolean;
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
  onMentionOutput,
  onGoToSource,
  onToggleAppView,
  isInAppView = false,
  businessMode = false,
  onOpenFullScreen,
  onToggleCollapse,
  isCollapsed,
  presentationMenu,
}: OutputContextMenuProps) {
  const keepComposerFocusOnCloseRef = React.useRef(false);
  const showPresentationSubmenu =
    !businessMode && presentationMenu && presentationMenu.options.length > 1;

  /**
   * Mentions the output and stops the menu from restoring focus to its trigger
   * after the composer has received focus.
   */
  const handleMentionOutputSelect = React.useCallback(() => {
    keepComposerFocusOnCloseRef.current = true;
    onMentionOutput?.(cellIndex, outputIndex);
  }, [cellIndex, onMentionOutput, outputIndex]);

  /** Preserves the composer focus requested by the output-mention action. */
  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    if (!keepComposerFocusOnCloseRef.current) return;

    keepComposerFocusOnCloseRef.current = false;
    event.preventDefault();
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-max [&_[data-slot=context-menu-item]]:whitespace-nowrap [&_[data-slot=context-menu-sub-trigger]]:whitespace-nowrap"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
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
        {onCopyOutput ? (
          <ContextMenuItem onClick={() => onCopyOutput(cellIndex, outputIndex)}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Output
          </ContextMenuItem>
        ) : null}

        {onMentionOutput ? (
          <ContextMenuItem onSelect={handleMentionOutputSelect}>
            <AtSign className="mr-2 h-4 w-4" />
            {businessMode ? "Mention in chat" : "Mention output in chat"}
          </ContextMenuItem>
        ) : null}

        {onGoToSource ? (
          <ContextMenuItem onClick={() => onGoToSource(cellIndex)}>
            <FileCode2 className="mr-2 h-4 w-4" />
            Go to source
          </ContextMenuItem>
        ) : null}

        {onToggleAppView ? (
          <ContextMenuItem
            onClick={() => onToggleAppView(cellIndex, outputIndex)}
          >
            {isInAppView && businessMode ? (
              <X className="mr-2 h-4 w-4" />
            ) : (
              <LayoutTemplate
                className={cn("mr-2 h-4 w-4", isInAppView && "!text-[#ff4800]")}
              />
            )}
            {isInAppView
              ? businessMode
                ? "Remove"
                : "Remove from App View"
              : "Add to App View"}
          </ContextMenuItem>
        ) : null}

        {onHideOutput ? (
          <ContextMenuItem onClick={() => onHideOutput(cellIndex, outputIndex)}>
            <EyeOff className="mr-2 h-4 w-4" />
            Hide Output
          </ContextMenuItem>
        ) : null}

        {onClearOutput ? (
          <ContextMenuItem onClick={() => onClearOutput(cellIndex, outputIndex)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Output
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
