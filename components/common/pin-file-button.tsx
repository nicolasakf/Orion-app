"use client";

import { Pin } from "lucide-react";

import { MAX_PINNED_FILE_PATHS } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

/** Pin / unpin control for file rows; stops propagation so row selection does not run. */
export function PinFileButton({
  path,
  isPinned,
  atPinLimit,
  onTogglePin,
  className,
}: {
  path: string;
  isPinned: boolean;
  atPinLimit: boolean;
  onTogglePin: (path: string) => void;
  className?: string;
}) {
  const disablePin = !isPinned && atPinLimit;

  return (
    <button
      type="button"
      className={cn(
        "corner-squircle shrink-0 rounded-md p-1 text-muted-foreground transition-colors",
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        "hover:bg-primary/10 hover:text-primary",
        isPinned && "opacity-100 text-primary",
        className,
      )}
      disabled={disablePin}
      aria-label={isPinned ? "Unpin file" : "Pin file"}
      aria-pressed={isPinned}
      title={
        disablePin
          ? `Pin limit reached (${MAX_PINNED_FILE_PATHS}). Unpin a file first.`
          : isPinned
            ? "Unpin file"
            : "Pin file"
      }
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!disablePin) onTogglePin(path);
      }}
    >
      <Pin
        className={cn("h-3.5 w-3.5", isPinned && "fill-current")}
        strokeWidth={isPinned ? 2.5 : 2}
      />
    </button>
  );
}
