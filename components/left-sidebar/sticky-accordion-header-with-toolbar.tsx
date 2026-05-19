"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { SIDEBAR_ACCORDION_STICKY_HEADER } from "./accordion-styles";

type TriggerProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>;

export interface StickyAccordionHeaderWithToolbarProps {
  /** Classes applied to the expand/collapse trigger (matches shadcn AccordionTrigger). */
  triggerClassName?: string;
  /** Title / label row (left side of the header). */
  children: React.ReactNode;
  /** Actions rendered beside the trigger — must not be nested inside the trigger `<button>`. */
  toolbar?: React.ReactNode;
  triggerProps?: Omit<TriggerProps, "className" | "children">;
}

/**
 * Sticky accordion header row: expand/collapse control plus optional toolbar.
 * Toolbar nodes sit outside Radix's trigger so icon buttons are not nested `<button>`s.
 * The chevron is rendered after the toolbar; an invisible full-row trigger handles clicks
 * (toolbar uses `pointer-events-auto`). Do not add `relative` on the header — it overrides
 * `sticky` in Tailwind’s CSS and breaks pinned headers in the sidebar scroller.
 */
export function StickyAccordionHeaderWithToolbar({
  triggerClassName,
  children,
  toolbar,
  triggerProps,
}: StickyAccordionHeaderWithToolbarProps) {
  const titleId = React.useId();

  return (
    <AccordionPrimitive.Header
      className={cn(
        SIDEBAR_ACCORDION_STICKY_HEADER,
        "flex w-full min-w-0 items-center gap-0 p-0"
      )}
    >
      <AccordionPrimitive.Trigger
        {...triggerProps}
        aria-labelledby={titleId}
        className={cn(
          "peer absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
          triggerClassName
        )}
      />
      <div className="relative z-10 flex min-w-0 flex-1 items-center py-2 px-2 pointer-events-none">
        <span id={titleId} className="flex min-w-0 flex-1 items-center text-left">
          {children}
        </span>
        {toolbar ? (
          <div className="flex shrink-0 items-center self-center pointer-events-auto">
            {toolbar}
          </div>
        ) : null}
      </div>
      <ChevronDown
        aria-hidden
        className="relative z-10 mr-2 h-4 w-4 shrink-0 pointer-events-none transition-transform duration-200 peer-data-[state=open]:rotate-180"
      />
    </AccordionPrimitive.Header>
  );
}
