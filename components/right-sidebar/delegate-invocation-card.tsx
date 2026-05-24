"use client";

/**
 * DelegateInvocationCard — Dedicated card for the `delegate` (sub-agent) tool.
 *
 * Unlike the generic ToolInvocationCard (an inline text row), this renders a
 * bordered card with:
 *  - Title row: sub-agent name + live status icon
 *  - Description row: current step action, updated while the sub-agent runs
 *  - Expand / collapse section showing the sub-agent's final response (done only)
 */

import * as React from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Loader2, Check, X, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AssistantMessage } from "./assistant-message";
import {
  delegateResultTmpNotebookPath,
  delegateResultToDisplayText,
} from "./delegate-result";

// ============================================================================
// Types
// ============================================================================

interface DelegateInvocationCardProps {
  subagentType: string;
  /** Live description of the current sub-agent step, updated while running. */
  progressDescription?: string;
  /** undefined = pending, string = done, object with error key = error. */
  result?: unknown;
  state:
    | "input-available"
    | "output-available"
    | "input-streaming"
    | "approval-requested"
    | "approval-responded"
    | "output-error"
    | "output-denied";
  onOpenSubchat?: () => void;
  reportPath?: string;
  onShowReport?: (path: string) => void;
  className?: string;
  /** Optional metadata used when highlighted sub-agent card text is mentioned in chat. */
  conversationReference?: {
    messageId: string;
    messageIndex: number;
    partIndex: number;
    toolCallId: string;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function resolveAgentLabel(subagentType: string): string {
  if (!subagentType) return "Sub-agent";
  const label = subagentType
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  return `${label} Agent`;
}

function isPendingState(
  state: DelegateInvocationCardProps["state"]
): boolean {
  return (
    state === "input-available" ||
    state === "input-streaming" ||
    state === "approval-requested" ||
    state === "approval-responded"
  );
}

/** Icon-only control; label exposed via tooltip and `aria-label`. */
function ShowReportButton({
  path,
  onShow,
}: {
  path: string;
  onShow: (path: string) => void;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Show report"
            onClick={(event) => {
              event.stopPropagation();
              onShow(path);
            }}
            className="corner-squircle inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Show report</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Gradient overlay for scrollable result area (same pattern as ToolInvocationCard).
 * Uses `muted` so the fade matches this card’s `bg-muted` surface.
 */
function ScrollGradient({
  position,
}: {
  position: "top" | "bottom" | "left" | "right";
}) {
  const styles: Record<string, string> = {
    top: "inset-x-0 top-0 h-4 bg-gradient-to-b from-muted to-transparent",
    bottom: "inset-x-0 bottom-0 h-4 bg-gradient-to-t from-muted to-transparent",
    left: "inset-y-0 left-0 w-4 bg-gradient-to-r from-muted to-transparent",
    right: "inset-y-0 right-0 w-4 bg-gradient-to-l from-muted to-transparent",
  };
  return (
    <div
      className={cn("pointer-events-none absolute z-10", styles[position])}
      aria-hidden
    />
  );
}

// ============================================================================
// Component
// ============================================================================

export function DelegateInvocationCard({
  subagentType,
  progressDescription,
  result,
  state,
  onOpenSubchat,
  reportPath,
  onShowReport,
  className,
  conversationReference,
}: DelegateInvocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({
    top: false,
    bottom: false,
    left: false,
    right: false,
  });

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollLeft, scrollHeight, clientHeight, scrollWidth, clientWidth } = el;
    setScrollEdges({
      top: scrollTop > 0,
      bottom: scrollTop + clientHeight < scrollHeight - 1,
      left: scrollLeft > 0,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  const isPending = isPendingState(state);
  const isError = state === "output-error" || state === "output-denied";
  const resultText = delegateResultToDisplayText(result);
  const canExpand = !isPending && !!resultText;
  const agentLabel = resolveAgentLabel(subagentType);
  const isOpenable = !!onOpenSubchat;
  const resolvedReportPath = reportPath ?? delegateResultTmpNotebookPath(result);
  const canShowReport = !!resolvedReportPath && !!onShowReport;

  useEffect(() => {
    if (!isExpanded || !resultText) return;
    const el = scrollRef.current;
    if (!el) return;
    updateScrollEdges();
    el.addEventListener("scroll", updateScrollEdges);
    const ro = new ResizeObserver(updateScrollEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollEdges);
      ro.disconnect();
    };
  }, [isExpanded, resultText, updateScrollEdges]);

  return (
    <div
      role={isOpenable ? "button" : undefined}
      tabIndex={isOpenable ? 0 : undefined}
      aria-label={isOpenable ? `Open ${agentLabel} chat` : undefined}
      onClick={onOpenSubchat}
      onKeyDown={(event) => {
        if (!isOpenable) return;
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenSubchat?.();
        }
      }}
      className={cn(
        "corner-squircle my-1 w-full min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-muted",
        isOpenable &&
          "cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      data-orion-conversation-reference={conversationReference ? "true" : undefined}
      data-orion-conversation-source={conversationReference ? "tool" : undefined}
      data-orion-message-id={conversationReference?.messageId}
      data-orion-message-index={conversationReference?.messageIndex}
      data-orion-part-index={conversationReference?.partIndex}
      data-orion-tool-name={conversationReference ? "delegate" : undefined}
      data-orion-tool-call-id={conversationReference?.toolCallId}
    >
      <div className="flex items-center gap-2 px-3 py-2">
          <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-xs font-medium text-foreground">{agentLabel}</span>

        {canExpand ? (
          <>
            {!isError && (
              <Check className="h-3 w-3 shrink-0 text-emerald-500" />
            )}
            {isError && <X className="h-3 w-3 shrink-0 text-destructive" />}
          {canShowReport && (
            <ShowReportButton
              path={resolvedReportPath!}
              onShow={onShowReport!}
            />
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsExpanded((v) => !v);
            }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse sub-agent response" : "Expand sub-agent response"}
            className="corner-squircle shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          </>
        ) : (
          <>
          {isPending && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          )}
          {!isPending && !isError && (
            <Check className="h-3 w-3 shrink-0 text-emerald-500" />
          )}
          {isError && <X className="h-3 w-3 shrink-0 text-destructive" />}
          {canShowReport && (
            <ShowReportButton
              path={resolvedReportPath!}
              onShow={onShowReport!}
            />
          )}
          </>
        )}
      </div>

      {/* Description row — live progress while running, hidden once collapsed and done */}
      {(isPending || progressDescription) && (
        <div className="px-3 pb-2 pt-0">
          <span className="text-[11px] text-muted-foreground/70">
            {progressDescription ?? "Starting..."}
          </span>
        </div>
      )}

      {/* Expanded result */}
      {isExpanded && resultText && (
        <div
          className="border-t border-border/40"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative min-w-0">
            <div
              ref={scrollRef}
              className="scrollbar-hide max-h-96 w-full min-w-0 overflow-x-auto overflow-y-auto p-3"
            >
              {isError ? (
                <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words font-mono text-destructive">
                  {resultText}
                </pre>
              ) : (
                <AssistantMessage content={resultText} />
              )}
            </div>
            {scrollEdges.top && <ScrollGradient position="top" />}
            {scrollEdges.bottom && <ScrollGradient position="bottom" />}
            {scrollEdges.left && <ScrollGradient position="left" />}
            {scrollEdges.right && <ScrollGradient position="right" />}
          </div>
        </div>
      )}
    </div>
  );
}
