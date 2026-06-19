"use client";

/**
 * ToolInvocationCard - Displays an agent tool call inline in the chat.
 *
 * Shows:
 * - Tool name with a human-friendly label
 * - Status: pending (spinner) / result (collapsible) / error
 */

import * as React from "react";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Ban,
  Check,
  X,
  AlertTriangle,
  Shield,
  ShieldCheck,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import type { ToolApprovalMode } from "@/lib/settings/schema";
import { DANGEROUS_TOOLS } from "@/lib/agent/tool-approval";
import {
  SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
  type ScrollToNotebookCellEventDetail,
} from "@/lib/notebook/notebook-execution-events";
import {
  safeArgs,
  getToolMeta,
  getToolLabel,
  getApprovalPreview,
  buildExpandedArgsPreview,
  type ToolInvocationArgsPreview,
} from "./tool-invocation-helpers";
import {
  cardDisplayTextForToolResult,
  getNotebookCellSourceChanges,
  getToolResultDisplaySegments,
  IS_TOOL_CARD_DEV_OVERLAY,
  type NotebookCellSourceChangeDisplay,
} from "./tool-invocation-result-display";
import { ScrollGradientOverlays, useScrollEdgeIndicators } from "./scroll-edge-gradient";

/** Client-side mirror of await_command's built-in wait budget. */
const AWAIT_COMMAND_COUNTDOWN_SECONDS = 30;

// ============================================================================
// Sub-components
// ============================================================================

/** Popover body that shows full preview content when truncated. */
function ArgsPreviewPopoverContent({ full }: { full: string }) {
  return (
    <PopoverContent align="start" side="bottom" className="max-w-[min(32rem,90vw)] p-2">
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-[10px] font-mono text-muted-foreground">
        {full}
      </pre>
    </PopoverContent>
  );
}

/** Inline preview row (used for both approval previews and expanded arg summaries). */
function ArgsPreviewRow({
  preview,
  className,
}: {
  preview: ToolInvocationArgsPreview;
  className?: string;
}) {
  const rowContent = (
    <>
      {preview.prefix && (
        <span className="text-[10px] font-mono text-muted-foreground/70 select-none shrink-0">
          {preview.prefix}
        </span>
      )}
      <span className="break-words text-[10px] font-mono text-muted-foreground">
        {preview.short}
      </span>
    </>
  );

  if (preview.full != null) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "corner-squircle flex w-full min-w-0 items-start gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-0 focus-visible:bg-accent",
              className
            )}
            aria-label="Show full content"
          >
            {rowContent}
          </button>
        </PopoverTrigger>
        <ArgsPreviewPopoverContent full={preview.full} />
      </Popover>
    );
  }

  return (
    <div className={cn("flex w-full min-w-0 items-start gap-1 px-2 py-1", className)}>
      {rowContent}
    </div>
  );
}

// ============================================================================
// Derived state helpers
// ============================================================================

/** Extract leading text from the result for prefix/status detection. */
function extractLeadingText(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === "string") return result[0];
  return null;
}

function isPendingState(
  state: ToolInvocationCardProps["state"]
): boolean {
  return (
    state === "input-available" ||
    state === "input-streaming" ||
    state === "approval-requested" ||
    state === "approval-responded"
  );
}

function detectIsError(result: unknown, isPending: boolean, leadingText: string | null): boolean {
  if (isPending || result == null) return false;
  if (typeof result === "object" && !Array.isArray(result) && "error" in (result as Record<string, unknown>)) {
    return true;
  }
  return leadingText != null && leadingText.startsWith("[ERROR");
}

function resultErrorCode(result: unknown): string | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const error = (result as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

function detectIsWarning(isPending: boolean, isError: boolean, leadingText: string | null): boolean {
  return !isPending && !isError && leadingText != null && leadingText.startsWith("[WARNING");
}

function resultToText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

/** Count down the visible wait budget while await_command is pending. */
function useAwaitCommandCountdown(
  toolName: OrionToolName,
  args: Record<string, unknown>,
  isPending: boolean
): number | null {
  const [secondsLeft, setSecondsLeft] = React.useState(AWAIT_COMMAND_COUNTDOWN_SECONDS);
  const terminalName = typeof args.terminalName === "string" ? args.terminalName : "";
  const shouldCountDown = toolName === "await_command" && isPending;

  React.useEffect(() => {
    if (!shouldCountDown) {
      setSecondsLeft(AWAIT_COMMAND_COUNTDOWN_SECONDS);
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsLeft(Math.max(AWAIT_COMMAND_COUNTDOWN_SECONDS - elapsedSeconds, 0));
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [shouldCountDown, terminalName]);

  return shouldCountDown ? secondsLeft : null;
}

/** Compact per-cell source deltas shown while the full result remains collapsed. */
function NotebookCellSourceChangeRows({
  changes,
}: {
  changes: NotebookCellSourceChangeDisplay[];
}) {
  if (changes.length === 0) return null;

  const navigateToCell = (cellIndex: number) => {
    window.dispatchEvent(
      new CustomEvent<ScrollToNotebookCellEventDetail>(
        SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
        { detail: { cellIndex } }
      )
    );
  };

  return (
    <div className="ml-1 mt-0.5 flex flex-wrap gap-1">
      {changes.map((change) => (
        <button
          type="button"
          key={change.cellIndex}
          className="corner-squircle inline-flex items-center gap-1 rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => navigateToCell(change.cellIndex)}
          aria-label={`Go to notebook cell ${change.cellIndex}`}
        >
          <span className="font-medium">Cell {change.cellIndex}</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{change.addedLines}
          </span>
          <span className="text-destructive">-{change.removedLines}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface ToolInvocationCardProps {
  toolName: OrionToolName;
  args: Record<string, unknown>;
  /** undefined = pending, string/object = result, Error = error */
  result?: unknown;
  state:
  | "input-available"
  | "output-available"
  | "input-streaming"
  | "approval-requested"
  | "approval-responded"
  | "output-error"
  | "output-denied";
  errorText?: string;
  className?: string;
  /** Whether this tool call is waiting for user approval */
  pendingApproval?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  toolApprovalMode?: ToolApprovalMode;
  onToolApprovalModeChange?: (mode: ToolApprovalMode) => void;
  /** Optional metadata used when highlighted tool-card text is mentioned in chat. */
  conversationReference?: {
    messageId: string;
    messageIndex: number;
    partIndex: number;
    toolCallId: string;
  };
}

export function ToolInvocationCard({
  toolName,
  args: rawArgs,
  result,
  state,
  errorText,
  className,
  pendingApproval,
  onApprove,
  onReject,
  toolApprovalMode,
  onToolApprovalModeChange,
  conversationReference,
}: ToolInvocationCardProps) {
  const args = safeArgs(rawArgs);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Derived state
  const meta = getToolMeta(toolName);
  const Icon = meta.icon;
  const isPending = isPendingState(state);
  const leadingText = extractLeadingText(result);
  const isCancelled =
    errorText === "cancelled_by_user" || resultErrorCode(result) === "cancelled_by_user";
  const isError = !isCancelled && (
    state === "output-error" ||
    state === "output-denied" ||
    detectIsError(result, isPending, leadingText)
  );
  const isWarning = detectIsWarning(isPending, isError, leadingText);
  const fullResultText = resultToText(result);
  /** Expanded panel: selected tools hide redundant metadata; full text stays in tool result. */
  const cardResultText = cardDisplayTextForToolResult(toolName, fullResultText);
  const devDisplaySegments = IS_TOOL_CARD_DEV_OVERLAY
    ? getToolResultDisplaySegments(toolName, fullResultText)
    : null;
  const notebookCellSourceChanges = getNotebookCellSourceChanges(fullResultText);
  /** Scroll/size observer: in dev the expanded pre shows the full raw result. */
  const expandedScrollKey = IS_TOOL_CARD_DEV_OVERLAY ? fullResultText : cardResultText;
  const canExpand = !isPending && !!fullResultText;

  const awaitCommandCountdown = useAwaitCommandCountdown(toolName, args, isPending);
  const toolLabel =
    awaitCommandCountdown == null
      ? getToolLabel(toolName, args, isPending, meta, leadingText, isError)
      : `Waiting ${awaitCommandCountdown}s for command to run`;

  const approvalPreview =
    pendingApproval && DANGEROUS_TOOLS.has(toolName)
      ? getApprovalPreview(toolName, args)
      : null;

  const expandedArgsPreview =
    isExpanded && fullResultText
      ? buildExpandedArgsPreview(toolName, args, leadingText, isError)
      : null;

  const { scrollRef, scrollEdges } = useScrollEdgeIndicators({
    active: Boolean(isExpanded && expandedScrollKey),
    contentKey: expandedScrollKey,
  });

  return (
    <div
      className={cn("my-0.5 w-full min-w-0 max-w-full text-[10px] font-mono", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-orion-conversation-reference={conversationReference ? "true" : undefined}
      data-orion-conversation-source={conversationReference ? "tool" : undefined}
      data-orion-message-id={conversationReference?.messageId}
      data-orion-message-index={conversationReference?.messageIndex}
      data-orion-part-index={conversationReference?.partIndex}
      data-orion-tool-name={conversationReference ? toolName : undefined}
      data-orion-tool-call-id={conversationReference?.toolCallId}
    >
      {/* Inline text row */}
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          className={cn(
            "corner-squircle flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors",
            canExpand && "cursor-pointer",
            isPending && "cursor-default"
          )}
          onClick={() => canExpand && setIsExpanded((v) => !v)}
          disabled={isPending}
        >
          {/* Tool icon + label */}
          <Icon
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground",
              canExpand && isHovered && "text-foreground"
            )}
          />
          <span
            className={cn(
              "font-medium text-muted-foreground",
              canExpand && isHovered && "text-foreground"
            )}
          >
            {toolLabel}
          </span>

          {/* Status icon */}
          <StatusIcon
            pendingApproval={pendingApproval}
            isPending={isPending}
            isCancelled={isCancelled}
            isError={isError}
            isWarning={isWarning}
          />

          {/* Expand chevron */}
          {canExpand && (
            <span
              className={cn(
                "shrink-0 transition-opacity",
                isHovered || isExpanded ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
          )}
        </button>

        {/* Approval mode dropdown */}
        {DANGEROUS_TOOLS.has(toolName) && onToolApprovalModeChange && (
          <ApprovalModeDropdown
            toolApprovalMode={toolApprovalMode}
            onToolApprovalModeChange={onToolApprovalModeChange}
            visible={isHovered || isExpanded}
          />
        )}
      </div>

      {/* Approval preview */}
      {approvalPreview && (
        <div className="corner-squircle mt-0.5 ml-1 my-2 overflow-hidden rounded-md border border-amber-500/30 bg-amber-500/5">
          <ArgsPreviewRow preview={approvalPreview} />
        </div>
      )}

      {/* Accept / Reject buttons */}
      {pendingApproval && onApprove && onReject && (
        <div className="flex items-center gap-1.5 ml-1 mt-0.5">
          <button
            type="button"
            className="corner-squircle inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 transition-colors"
            onClick={onApprove}
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
          <button
            type="button"
            className="corner-squircle inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            onClick={onReject}
          >
            <X className="h-3 w-3" />
            Reject
          </button>
        </div>
      )}

      <NotebookCellSourceChangeRows changes={notebookCellSourceChanges} />

      {/* Expanded result */}
      {isExpanded && fullResultText && (
        <div className="corner-squircle relative mt-0.5 w-full min-w-0 max-w-full overflow-hidden rounded-md border border-border/50 bg-transparent">
          {expandedArgsPreview && (
            <div className="shrink-0 border-b border-border/40 bg-muted">
              <div className="flex flex-wrap items-baseline gap-x-0.5 gap-y-0.5">
                <ArgsPreviewRow preview={expandedArgsPreview} className="items-baseline" />
              </div>
            </div>
          )}
          <div className="relative min-w-0">
            <div
              ref={scrollRef}
              className="scrollbar-hide max-h-40 w-full min-w-0 overflow-auto px-2 py-1"
            >
              <pre
                className={cn(
                  "inline-block min-w-full whitespace-pre text-[11px] leading-snug",
                  !IS_TOOL_CARD_DEV_OVERLAY &&
                  (isError ? "text-destructive" : "text-muted-foreground")
                )}
              >
                {IS_TOOL_CARD_DEV_OVERLAY && devDisplaySegments ? (
                  devDisplaySegments.map((seg, i) => (
                    <span
                      key={i}
                      className={
                        seg.strippedFromUserCard
                          ? "text-muted-foreground/70"
                          : isError
                            ? "text-destructive"
                            : "text-foreground"
                      }
                    >
                      {seg.text}
                    </span>
                  ))
                ) : (
                  cardResultText
                )}
              </pre>
            </div>
            <ScrollGradientOverlays edges={scrollEdges} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Small private sub-components
// ============================================================================

function StatusIcon({
  pendingApproval,
  isPending,
  isCancelled,
  isError,
  isWarning,
}: {
  pendingApproval?: boolean;
  isPending: boolean;
  isCancelled: boolean;
  isError: boolean;
  isWarning: boolean;
}) {
  if (pendingApproval) return <Shield className="h-3 w-3 shrink-0 text-amber-500" />;
  if (isPending) return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />;
  if (isCancelled) {
    return <Ban aria-label="Cancelled" className="h-3 w-3 shrink-0 text-muted-foreground" />;
  }
  if (isError) return <X className="h-3 w-3 shrink-0 text-destructive" />;
  if (isWarning) return <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />;
  return <Check className="h-3 w-3 shrink-0 text-emerald-500" />;
}

function ApprovalModeDropdown({
  toolApprovalMode,
  onToolApprovalModeChange,
  visible,
}: {
  toolApprovalMode?: ToolApprovalMode;
  onToolApprovalModeChange: (mode: ToolApprovalMode) => void;
  visible: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const currentMode: ToolApprovalMode = toolApprovalMode ?? "always_ask";

  const selectMode = (mode: ToolApprovalMode) => {
    setOpen(false);
    if (mode === currentMode) return;
    onToolApprovalModeChange(mode);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "corner-squircle shrink-0 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] cursor-pointer text-muted-foreground hover:text-foreground hover:bg-transparent focus:outline-none focus:ring-0 transition-opacity",
            visible ? "opacity-100" : "opacity-0"
          )}
          aria-label="Tool approval settings"
        >
          {currentMode === "auto_run" ? (
            <Play className="h-3 w-3 shrink-0" />
          ) : (
            <ShieldCheck className="h-3 w-3 shrink-0" />
          )}
          <span>{currentMode === "auto_run" ? "Auto Run" : "Always Ask"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-40 overflow-hidden p-1"
      >
        <button
          type="button"
          className={cn(
            "corner-squircle flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-accent",
            currentMode === "always_ask" && "font-medium text-foreground"
          )}
          onClick={() => selectMode("always_ask")}
        >
          <ShieldCheck className="h-3 w-3" />
          Always ask
        </button>
        <button
          type="button"
          className={cn(
            "corner-squircle flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-accent",
            currentMode === "auto_run" && "font-medium text-foreground"
          )}
          onClick={() => selectMode("auto_run")}
        >
          <Play className="h-3 w-3" />
          Auto-run
        </button>
      </PopoverContent>
    </Popover>
  );
}
