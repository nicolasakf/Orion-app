"use client";

import * as React from "react";
import { Minimize2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CompactionSummary } from "@/lib/chat/chat-types";
import { cn } from "@/lib/utils";

interface CompactionDividerProps {
  summary: CompactionSummary;
}

/** Clickable divider between compacted and retained chat history. */
export function CompactionDivider({ summary }: CompactionDividerProps) {
  const [open, setOpen] = React.useState(false);
  const createdLabel = summary.createdAt.toLocaleString();
  const tokensSavedLabel =
    summary.tokensSaved > 0
      ? `${Math.round(summary.tokensSaved / 1000)}k tokens saved`
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex w-full items-center gap-3 px-1 py-3",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        )}
        aria-label="View compaction summary"
      >
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-r from-transparent via-border/80 to-border transition-colors group-hover:via-muted-foreground/35"
        />
        <span
          className={cn(
            "corner-squircle inline-flex shrink-0 items-center gap-1.5 rounded-full",
            "border border-border/60 bg-muted/30 px-3 py-1",
            "text-xs font-medium text-muted-foreground shadow-sm",
            "transition-all group-hover:border-border group-hover:bg-muted/60 group-hover:text-foreground"
          )}
        >
          <Minimize2 className="size-3 shrink-0 opacity-70" aria-hidden />
          <span>Conversation compacted</span>
        </span>
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-l from-transparent via-border/80 to-border transition-colors group-hover:via-muted-foreground/35"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Compaction summary</DialogTitle>
            <DialogDescription>
              {createdLabel}
              {tokensSavedLabel ? ` · ${tokensSavedLabel}` : ""}
              {summary.model ? ` · ${summary.model}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
              {summary.text}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
