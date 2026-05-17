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

export type ToolbarButtonProps = ButtonProps & {
  toolTipLabel?: string | string[];
  toolTipShortcut?: ShortcutSequence | ShortcutSequence[];
};

type ShortcutElement = string | React.ComponentType<{ className?: string }>;
type ShortcutSequence = ShortcutElement | ShortcutElement[];

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
                      <kbd className="pointer-events-none ml-2 inline-flex shrink-0 flex-nowrap h-5 min-h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[12px] font-medium text-muted-foreground opacity-100">
                        {renderShortcutSequence(shortcuts[index])}
                      </kbd>
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
