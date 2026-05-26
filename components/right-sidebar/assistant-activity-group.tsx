"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Shield,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

type ActivityStatus = "running" | "approval" | "error" | "warning" | "complete";

interface AssistantActivityGroupProps {
  toolCount: number;
  durationMs?: number;
  status: ActivityStatus;
  autoCollapse: boolean;
  forceExpanded: boolean;
  children: React.ReactNode;
}

/** Format activity elapsed time for the compact chat row. */
function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 1) return "briefly";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

/** Collapsible wrapper for reasoning/tool activity between assistant text parts. */
export function AssistantActivityGroup({
  toolCount,
  durationMs,
  status,
  autoCollapse,
  forceExpanded,
  children,
}: AssistantActivityGroupProps) {
  const [isExpanded, setIsExpanded] = React.useState(() => !autoCollapse);
  const userInteractedRef = React.useRef(false);

  React.useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
      return;
    }
    if (autoCollapse && !userInteractedRef.current) {
      setIsExpanded(false);
    }
  }, [autoCollapse, forceExpanded]);

  const label =
    durationMs !== undefined
      ? `Worked for ${formatDuration(durationMs)}`
      : toolCount === 0
        ? "Thought through response"
        : toolCount === 1
          ? "Used 1 tool"
          : `Used ${toolCount} tools`;

  /** Toggle details and preserve the user's manual expanded/collapsed choice. */
  const toggleExpanded = () => {
    userInteractedRef.current = true;
    setIsExpanded((current) => !current);
  };

  const StatusIcon =
    status === "running"
      ? Loader2
      : status === "approval"
        ? Shield
        : status === "error"
          ? X
          : status === "warning"
            ? AlertTriangle
            : Check;

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        className="corner-squircle flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
        <span className="truncate font-medium">{label}</span>
        <StatusIcon
          className={cn(
            "h-3 w-3 shrink-0",
            status === "running" && "animate-spin text-muted-foreground",
            status === "approval" && "text-amber-500",
            status === "error" && "text-destructive",
            status === "warning" && "text-amber-500",
            status === "complete" && "text-emerald-500"
          )}
        />
      </button>

      {isExpanded && (
        <div className="mt-1 space-y-2 border-l border-muted pl-3">
          {children}
        </div>
      )}
    </div>
  );
}
