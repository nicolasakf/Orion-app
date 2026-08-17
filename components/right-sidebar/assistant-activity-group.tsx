"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface AssistantActivityGroupProps {
  toolCount: number;
  durationMs?: number;
  isWaitingForFinalResponse: boolean;
  autoCollapse: boolean;
  forceExpanded: boolean;
  /** Newest activity items rendered before older ones collapse behind a button. */
  maxVisibleItems?: number;
  children: React.ReactNode;
}

/**
 * How many activity items an expanded run mounts before the rest hide.
 *
 * A long research loop appends every step to one assistant message, so an
 * expanded group has no natural ceiling — session 1786825713795 reached 39 tool
 * cards in a single run, all mounted and re-rendered while it streamed. The
 * newest steps are what the user is actually watching.
 */
const DEFAULT_MAX_VISIBLE_ACTIVITY_ITEMS = 20;

/** Format activity elapsed time for the compact chat row. */
function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 1) return "briefly";
  if (seconds < 60) return `for ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `for ${minutes} m` : `for ${minutes} m ${remainder} s`;
}

/** Format the number of tool calls represented by a compact activity row. */
function formatToolCount(toolCount: number): string {
  if (toolCount === 0) return "no tools";
  return toolCount === 1 ? "1 tool" : `${toolCount} tools`;
}

/** Collapsible wrapper for reasoning/tool activity between assistant text parts. */
export function AssistantActivityGroup({
  toolCount,
  durationMs,
  isWaitingForFinalResponse,
  autoCollapse,
  forceExpanded,
  maxVisibleItems = DEFAULT_MAX_VISIBLE_ACTIVITY_ITEMS,
  children,
}: AssistantActivityGroupProps) {
  const [isExpanded, setIsExpanded] = React.useState(
    () => forceExpanded || isWaitingForFinalResponse || !autoCollapse
  );
  const [showAllItems, setShowAllItems] = React.useState(false);
  const userInteractedRef = React.useRef(false);

  const items = React.useMemo(() => React.Children.toArray(children), [children]);
  const hiddenItemCount = showAllItems ? 0 : Math.max(0, items.length - maxVisibleItems);
  const visibleItems = hiddenItemCount > 0 ? items.slice(hiddenItemCount) : items;

  React.useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
      return;
    }
    if (isWaitingForFinalResponse) {
      if (!userInteractedRef.current) {
        setIsExpanded(true);
      }
      return;
    }
    if (autoCollapse) {
      setIsExpanded(false);
    }
  }, [autoCollapse, forceExpanded, isWaitingForFinalResponse]);

  const durationLabel = durationMs !== undefined ? ` ${formatDuration(durationMs)}` : "";
  const label = isWaitingForFinalResponse
    ? "Working..."
    : `Worked${durationLabel} · Used ${formatToolCount(toolCount)}`;

  /** Toggle details and preserve the user's manual expanded/collapsed choice. */
  const toggleExpanded = () => {
    userInteractedRef.current = true;
    setIsExpanded((current) => !current);
  };

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        className="corner-squircle flex min-w-0 items-center gap-1.5 rounded py-0.5 pl-0 pr-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
      >
        <ChevronRight
          className={cn(
            "-ml-1.5 h-3 w-3 shrink-0 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
        <span
          className={cn(
            "truncate font-medium",
            isWaitingForFinalResponse && "muted-text-shine"
          )}
        >
          {label}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-1 space-y-2 border-l border-muted pl-3">
          {hiddenItemCount > 0 && (
            <button
              type="button"
              className="corner-squircle rounded py-0.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setShowAllItems(true)}
            >
              {`Show ${hiddenItemCount} earlier step${hiddenItemCount === 1 ? "" : "s"}`}
            </button>
          )}
          {visibleItems}
        </div>
      )}
    </div>
  );
}
