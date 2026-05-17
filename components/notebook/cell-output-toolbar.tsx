"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { Copy, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Separator } from "../ui/separator";

interface CellOutputToolbarProps {
  /** Whether the toolbar is currently visible */
  isVisible: boolean;
  cellIndex: number;
  onClearOutput: (cellIndex: number) => void;
  onCopyOutput: (cellIndex: number) => void;
  onHideOutput: (cellIndex: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

type ToolbarItem =
  | { kind: "action"; Icon: LucideIcon; label: string; onAction: (cellIndex: number) => void; tooltipAlign?: "end" }
  | { kind: "sep" };

const BUTTON_ICON = "h-2.5 w-2.5 text-muted-foreground hover:text-foreground transition-colors";

/**
 * Floating toolbar at the bottom-right of the cell output on hover:
 * copy, hide, and clear output.
 */
export function CellOutputToolbar({
  isVisible,
  cellIndex,
  onClearOutput,
  onCopyOutput,
  onHideOutput,
  onMouseEnter,
  onMouseLeave,
}: CellOutputToolbarProps) {
  if (!isVisible) return null;

  const items: ToolbarItem[] = [
    { kind: "action", Icon: Copy, label: "Copy outputs", onAction: onCopyOutput },
    { kind: "action", Icon: EyeOff, label: "Hide outputs", onAction: onHideOutput },
    { kind: "sep" },
    {
      kind: "action",
      Icon: Trash2,
      label: "Clear outputs",
      onAction: onClearOutput,
      tooltipAlign: "end",
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "absolute bottom-1 right-1 z-10",
          "flex items-center gap-1 px-1 py-0.5",
          "rounded border bg-background/95 shadow-sm backdrop-blur-sm",
          "animate-in fade-in-0 duration-150"
        )}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) =>
          item.kind === "sep" ? (
            <Separator
              key={`sep-${i}`}
              orientation="vertical"
              className="h-3 shrink-0 bg-cell-separator-foreground"
            />
          ) : (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 hover:bg-accent"
                  onClick={() => item.onAction(cellIndex)}
                >
                  <item.Icon className={BUTTON_ICON} />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent
                  side="top"
                  align={item.tooltipAlign}
                  alignOffset={item.tooltipAlign === "end" ? -12 : undefined}
                  className="z-[100] px-1 py-0.5"
                >
                  <p className="text-[10px] leading-tight">{item.label}</p>
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )
        )}
      </div>
    </TooltipProvider>
  );
}
