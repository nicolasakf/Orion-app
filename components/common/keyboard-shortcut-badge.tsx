"use client";

import React from "react";

import { cn } from "@/lib/utils";

export type ShortcutElement = string | React.ComponentType<{ className?: string }>;
export type ShortcutSequence = ShortcutElement | ShortcutElement[];

/** Renders one key or modifier icon inside a shortcut badge. */
function renderShortcutElement(
  shortcutElement: ShortcutElement,
  iconClassName: string,
) {
  if (typeof shortcutElement === "string") {
    return shortcutElement;
  }

  const ShortcutComponent = shortcutElement;
  return <ShortcutComponent className={iconClassName} />;
}

/** Renders a full shortcut sequence (single key or chord) inside a badge. */
function renderShortcutSequence(
  sequence: ShortcutSequence,
  iconClassName: string,
) {
  if (Array.isArray(sequence)) {
    if (
      sequence.length > 0 &&
      (typeof sequence[0] === "string" || typeof sequence[0] === "function")
    ) {
      return sequence.map((element, index) => (
        <React.Fragment key={index}>
          {renderShortcutElement(element as ShortcutElement, iconClassName)}
        </React.Fragment>
      ));
    }
  }

  return renderShortcutElement(sequence as ShortcutElement, iconClassName);
}

/** Keyboard shortcut badge shared by toolbar tooltips, menus, and similar UI. */
export function KeyboardShortcutBadge({
  className,
  sequence,
  size = "default",
}: {
  className?: string;
  sequence: ShortcutSequence;
  size?: "default" | "sm";
}) {
  const iconClassName = size === "sm" ? "h-1.5 w-1.5" : "h-3 w-3";

  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-h-5 shrink-0 flex-nowrap select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[12px] font-medium text-muted-foreground opacity-100",
        className,
      )}
    >
      {renderShortcutSequence(sequence, iconClassName)}
    </kbd>
  );
}
