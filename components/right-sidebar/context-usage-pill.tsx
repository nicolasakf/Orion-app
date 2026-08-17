"use client";

import * as React from "react";
import { Minimize2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type {
  ContextUsageRowKey,
  ContextUsageView,
} from "@/lib/agent/context-usage";

import type { ContextUsagePhase } from "./use-context-usage";

// ────────────────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────────────────

type UsageLevel = "unknown" | "ok" | "watch" | "warn" | "over";

/**
 * Map a fraction of the usable budget to a display level.
 *
 * `null` means the model's context window is a guess, so there is no honest
 * denominator — the ring renders neutral rather than inventing a percentage.
 */
function usageLevelOf(percentUsed: number | null): UsageLevel {
  if (percentUsed === null) return "unknown";
  if (percentUsed < 0.5) return "ok";
  if (percentUsed < 0.8) return "watch";
  if (percentUsed < 1.0) return "warn";
  return "over";
}

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const exactFormatter = new Intl.NumberFormat("en-US");

/** Compact form for headline numbers, e.g. "12.4k". */
function formatCompact(tokens: number): string {
  return compactFormatter.format(tokens);
}

/**
 * Exact, grouped form for breakdown rows.
 *
 * Rows are shown exactly rather than rounded to thousands so they visibly sum to
 * the total. Independently rounding each row is what made the old breakdown look
 * like it could not add up.
 */
function formatExact(tokens: number): string {
  const formatted = exactFormatter.format(Math.abs(tokens));
  return tokens < 0 ? `−${formatted}` : formatted;
}

const ROW_LABELS: Record<ContextUsageRowKey, string> = {
  system: "System prompt",
  messages: "Messages",
  tools: "Tool definitions",
  images: "Images & attachments",
  framing: "Message framing",
  calibration: "Provider accounting",
  reply: "Latest reply",
  draft: "Your draft",
};

/** Rows priced locally rather than measured server-side. */
const LOCAL_ROW_KEYS = new Set<ContextUsageRowKey>(["reply", "draft"]);

// ────────────────────────────────────────────────────────────────────────────
// Ring
// ────────────────────────────────────────────────────────────────────────────

/** Small progress ring; renders an indeterminate track when the budget is unknown. */
function ContextUsageRing({
  percentUsed,
  level,
  className,
}: {
  percentUsed: number | null;
  level: UsageLevel;
  className?: string;
}) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(percentUsed ?? 0, 0), 1);
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
        strokeWidth={2}
        className={cn(
          level === "unknown" ? "text-muted-foreground/40" : "text-muted-foreground/25"
        )}
        stroke="currentColor"
        strokeDasharray={level === "unknown" ? "2 3" : undefined}
      />
      {level !== "unknown" && (
        <circle
          cx={10}
          cy={10}
          r={r}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={`${dash} ${c}`}
          className={cn(
            level === "ok" && "text-muted-foreground",
            level === "watch" && "text-amber-500",
            (level === "warn" || level === "over") && "text-red-500"
          )}
        />
      )}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

interface ContextUsagePillProps {
  usage: ContextUsageView | null;
  phase: ContextUsagePhase;
  hasMessages: boolean;
  /** Hides technical token categories in simplified experiences. */
  simple?: boolean;
  /** Called when the user clicks the pill to compact the conversation. */
  onCompact?: () => void;
  className?: string;
}

/**
 * Shows how much of the model's context the conversation occupies.
 *
 * Every number here comes from one server-side measurement of the real prepared
 * prompt, plus locally priced additions that are labelled as such. The rows always
 * sum to the headline total, and the reply reserve is presented as part of the
 * window rather than as a consumer of it — it is subtracted from the denominator,
 * not added to the numerator.
 */
export function ContextUsagePill({
  usage,
  phase,
  hasMessages,
  simple = false,
  onCompact,
  className,
}: ContextUsagePillProps) {
  if (!hasMessages || phase === "idle") return null;

  const level = usageLevelOf(usage?.percentUsed ?? null);
  const percentLabel =
    usage?.percentUsed != null ? `${Math.round(usage.percentUsed * 100)}%` : "—";

  // Compaction is offered whenever the conversation is genuinely large. With an
  // unknown window there is no percentage to threshold on, so the affordance
  // follows the measured status instead of disappearing entirely.
  const isActionable =
    usage != null && (level === "warn" || level === "over" || usage.status !== "ok");
  const canCompact = isActionable && onCompact != null;

  const ariaLabel = usage
    ? usage.percentUsed != null
      ? `Context usage ${percentLabel} of the model window${canCompact ? ". Click to compact." : ""}`
      : `Context usage ${formatCompact(usage.totalTokens)} tokens; model window unknown${canCompact ? ". Click to compact." : ""}`
    : "Context usage is being measured";

  const trigger = (
    <button
      type="button"
      aria-disabled={!canCompact}
      aria-label={ariaLabel}
      onClick={() => {
        if (canCompact) onCompact();
      }}
      className={cn(
        "corner-squircle relative inline-flex size-7 items-center justify-center rounded-md transition-colors",
        level === "unknown" && "text-muted-foreground hover:bg-muted/60",
        level === "ok" && "text-muted-foreground hover:bg-muted/60",
        level === "watch" && "text-amber-500 hover:bg-amber-500/10",
        level === "warn" && "text-red-500 hover:bg-red-500/10",
        level === "over" && "text-red-600 hover:bg-red-600/10",
        canCompact ? "cursor-pointer" : "cursor-default",
        usage?.isStale && "opacity-70",
        className
      )}
    >
      <ContextUsageRing percentUsed={usage?.percentUsed ?? null} level={level} />
      {canCompact && (
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
        className="w-auto min-w-[13rem] space-y-2 p-3 text-xs"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium text-foreground">Context usage</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              level === "unknown" && "text-muted-foreground",
              level === "ok" && "text-muted-foreground",
              level === "watch" && "text-amber-600 dark:text-amber-400",
              (level === "warn" || level === "over") && "text-red-600 dark:text-red-400"
            )}
          >
            {percentLabel}
          </span>
        </div>

        {!usage ? (
          <p className="text-[11px] text-muted-foreground">
            {phase === "unavailable"
              ? "Context measurement is unavailable right now."
              : "Measuring the prepared prompt…"}
          </p>
        ) : (
          <>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatCompact(usage.totalTokens)} tokens used
            </p>

            {!simple && (
              <div className="space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                {usage.rows.map((row) => (
                  <div key={row.key} className="flex justify-between gap-6">
                    <span>
                      {ROW_LABELS[row.key]}
                      {LOCAL_ROW_KEYS.has(row.key) && (
                        <span className="ml-1 opacity-60">(estimated)</span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums">{formatExact(row.tokens)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-6 border-t border-border pt-1 font-medium text-foreground">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{formatExact(usage.totalTokens)}</span>
                </div>
              </div>
            )}

            {/* The reply reserve belongs to the window, not to usage: it is
                subtracted from the budget rather than consumed by the prompt. */}
            <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
              {usage.window.contextWindowIsFallback
                ? "Model context window unknown, so no percentage is shown."
                : `Window ${formatCompact(usage.window.contextWindow)} · ${formatCompact(
                    usage.budget.outputReserve
                  )} reserved for the reply`}
            </p>

            <p className="text-[11px] text-muted-foreground">
              {usage.confidence === "exact"
                ? "Measured by the provider"
                : usage.confidence === "calibrated"
                  ? `Estimate, calibrated from ${usage.calibrationSampleCount} request${
                      usage.calibrationSampleCount === 1 ? "" : "s"
                    }`
                  : "Estimate, not yet calibrated for this model"}
              {usage.hasLocalDelta && ", plus unsent additions"}
              {usage.isStale && " · awaiting remeasure"}
            </p>

            {phase === "unavailable" && (
              <p className="text-[11px] text-muted-foreground">
                Last known measurement; a refresh did not succeed.
              </p>
            )}

            {canCompact && (
              <p className="text-[11px] text-muted-foreground">
                Click the ring to compact and free space.
              </p>
            )}
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
