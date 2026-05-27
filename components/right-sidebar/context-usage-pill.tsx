"use client";

import * as React from "react";
import { Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  estimateMessageTokens,
  COMPACTION_AUTO_THRESHOLD,
  type TokenEstimate,
} from "@/lib/agent/token-budget";
import { buildWirePayload } from "@/lib/agent/context-optimizer";
import type { CompactionSummary } from "@/lib/chat/chat-storage";
import type { UIMessage } from "ai";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type UsageLevel = "ok" | "watch" | "warn" | "over";

function usageLevelOf(pct: number): UsageLevel {
  if (pct < 0.5) return "ok";
  if (pct < 0.8) return "watch";
  if (pct < 1.0) return "warn";
  return "over";
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

/** Small SVG ring; `fraction` is 0..1 (clamped for stroke; true % still in hovercard). */
function ContextUsageRing({
  fraction,
  level,
  className,
}: {
  fraction: number;
  level: UsageLevel;
  className?: string;
}) {
  const r = 7;
  const stroke = 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const dash = c * clamped;

  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      className={cn("shrink-0 -rotate-90", className)}
      aria-hidden
    >
      <circle
        cx={10}
        cy={10}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="text-muted-foreground/25"
        stroke="currentColor"
      />
      <circle
        cx={10}
        cy={10}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke="currentColor"
        strokeDasharray={`${dash} ${c}`}
        className={cn(
          level === "ok" && "text-muted-foreground",
          level === "watch" && "text-amber-500",
          (level === "warn" || level === "over") && "text-red-500"
        )}
      />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

/**
 * Memoized token estimate for the current wire payload.
 * Recomputes when messages, model, or compaction summary change.
 * Debounced to avoid redundant work on rapid message updates.
 */
export function useContextEstimate(
  messages: UIMessage[],
  contextWindow: number,
  compactionSummary: CompactionSummary | null | undefined,
  systemPromptEstimateChars?: number,
  additionalImageCount = 0
) {
  const [estimate, setEstimate] = React.useState<ReturnType<typeof estimateMessageTokens> | null>(
    null
  );

  const systemPrompt = React.useMemo(
    () => " ".repeat(systemPromptEstimateChars ?? 3000),
    [systemPromptEstimateChars]
  );

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      const wire = buildWirePayload(messages, compactionSummary);
      const est = estimateMessageTokens(wire, systemPrompt, {
        contextWindow,
        additionalImageCount,
      });
      setEstimate(est);
    }, 150);
    return () => window.clearTimeout(id);
  }, [messages, contextWindow, compactionSummary, systemPrompt, additionalImageCount]);

  return estimate;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

interface ContextUsagePillProps {
  estimate: TokenEstimate | null;
  hasMessages: boolean;
  /** Called when the user clicks the pill at warn/over context levels. */
  onCompact?: () => void;
  className?: string;
}

export function ContextUsagePill({
  estimate,
  hasMessages,
  onCompact,
  className,
}: ContextUsagePillProps) {
  if (!estimate || !hasMessages) return null;

  const level = usageLevelOf(estimate.percentUsed);
  const cap = estimate.cap;
  const isActionable = level === "warn" || level === "over";
  const isOverBudget = estimate.percentUsed >= COMPACTION_AUTO_THRESHOLD;
  const pctLabel = `${Math.round(estimate.percentUsed * 100)}%`;

  const handleClick = () => {
    if (isActionable && onCompact) onCompact();
  };

  const trigger = (
    <button
      type="button"
      aria-disabled={!isActionable || !onCompact}
      aria-label={`Context usage ${pctLabel} of window${isOverBudget && isActionable ? ". Click to compact." : ""}`}
      onClick={handleClick}
      className={cn(
        "corner-squircle relative inline-flex size-7 items-center justify-center rounded-md transition-colors",
        level === "ok" && "text-muted-foreground hover:bg-muted/60",
        level === "watch" && "text-amber-500 hover:bg-amber-500/10",
        level === "warn" && "text-red-500 hover:bg-red-500/10",
        level === "over" && "text-red-600 hover:bg-red-600/10",
        isActionable && onCompact && "cursor-pointer",
        (!isActionable || !onCompact) && "cursor-default",
        className
      )}
    >
      <ContextUsageRing fraction={estimate.percentUsed} level={level} />
      {isActionable && onCompact && (
        <Minimize2
          className="pointer-events-none absolute bottom-0.5 right-0.5 h-2 w-2 opacity-90"
          aria-hidden
        />
      )}
    </button>
  );

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="end"
        className="w-auto min-w-[11rem] space-y-2 p-3 text-xs"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium text-foreground">Context usage</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              level === "ok" && "text-muted-foreground",
              level === "watch" && "text-amber-600 dark:text-amber-400",
              (level === "warn" || level === "over") && "text-red-600 dark:text-red-400"
            )}
          >
            {pctLabel}
          </span>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTokens(estimate.totalTokens)} / {formatTokens(cap)} tokens
        </p>
        <div className="space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          <div className="flex justify-between gap-6">
            <span>System</span>
            <span className="font-mono tabular-nums">{formatTokens(estimate.breakdown.system)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Messages</span>
            <span className="font-mono tabular-nums">{formatTokens(estimate.breakdown.messages)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Tools</span>
            <span className="font-mono tabular-nums">{formatTokens(estimate.breakdown.tools)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Images & attachments</span>
            <span className="font-mono tabular-nums">{formatTokens(estimate.breakdown.images)}</span>
          </div>
        </div>
        {isActionable && onCompact && (
          <p className="text-[11px] text-muted-foreground">Click the ring to compact and free space.</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
