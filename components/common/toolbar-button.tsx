"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import {
  isTooltipReopenFromOverlaySuppressed,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import React from "react";

import {
  KeyboardShortcutBadge,
  type ShortcutSequence,
} from "@/components/common/keyboard-shortcut-badge";

export type ToolbarButtonProps = ButtonProps & {
  toolTipLabel?: string | string[];
  toolTipShortcut?: ShortcutSequence | ShortcutSequence[];
};

/**
 * Reusable icon button with optional tooltip labels and shortcuts for toolbar UIs.
 * Forwarded ref support lets consumers compose it with Radix `asChild` triggers.
 */
export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  (props, ref) => {
    const { className, toolTipLabel, toolTipShortcut, children, ...rest } = props;
    const [tooltipOpen, setTooltipOpen] = React.useState(false);

    const labels = Array.isArray(toolTipLabel)
      ? toolTipLabel
      : toolTipLabel
      ? [toolTipLabel]
      : [];
    const shortcuts = toolTipShortcut
      ? Array.isArray(toolTipShortcut)
        ? toolTipShortcut
        : [toolTipShortcut]
      : [];

    if (shortcuts.length > 0 && labels.length !== shortcuts.length) {
      console.error(
        "toolTipLabel and toolTipShortcut props should have the same number of elements for ToolbarButton."
      );
    }

    const onTooltipOpenChange = (open: boolean) => {
      if (open && isTooltipReopenFromOverlaySuppressed()) {
        return;
      }
      setTooltipOpen(open);
    };

    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip open={tooltipOpen} onOpenChange={onTooltipOpenChange}>
          <TooltipTrigger asChild>
            <Button
              ref={ref}
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                className
              )}
              {...rest}
            >
              {children}
            </Button>
          </TooltipTrigger>
          {labels.length > 0 && (
            <TooltipPortal>
              {/*
                Portal to document.body so tooltips escape the left sidebar scroll
                stacking context (z-0) and still appear above the tab bar (z-30).
              */}
              <TooltipContent className="z-[100]">
                {labels.map((label, index) => (
                  <div className="flex items-center" key={index}>
                    <p>{label}</p>
                    {shortcuts[index] && (
                      <KeyboardShortcutBadge
                        className="ml-2"
                        sequence={shortcuts[index]}
                      />
                    )}
                  </div>
                ))}
              </TooltipContent>
            </TooltipPortal>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }
);

ToolbarButton.displayName = "ToolbarButton";
