"use client";

import { PlugZap, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NoKernelPromptProps {
  /** Customizable description text shown below the title. */
  description?: string;
  /** Button label (defaults to "Connect to Jupyter"). */
  buttonLabel?: string;
  /** Callback when the connect button is clicked. */
  onConnect?: () => void;
  /** Optional dismiss callback — hides the X button if omitted. */
  onDismiss?: () => void;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

/**
 * Shared "no kernel connected" prompt with amber styling.
 *
 * Used in chat body and terminal panel to prompt the user to connect a kernel.
 */
export function NoKernelPrompt({
  description = "Connect to a Jupyter server to run notebooks and agent tools.",
  buttonLabel = "Connect to Jupyter",
  onConnect,
  onDismiss,
  className,
}: NoKernelPromptProps) {
  return (
    <div
      className={cn(
        "corner-squircle flex w-full items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400",
        className
      )}
    >
      <PlugZap className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium leading-snug">No Jupyter server</p>
        <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/70">
          {description}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 border-amber-500/40 bg-amber-500/10 px-2.5 text-xs text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
          onClick={onConnect}
        >
          {buttonLabel}
        </Button>
      </div>
      {onDismiss && (
        <button
          className="corner-squircle ml-auto shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
