"use client";

import * as React from "react";
import { type UIMessage, isToolUIPart } from "ai";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, AtSign, ChevronDown, Copy, GitFork } from "lucide-react";
import { ToolInvocationCard } from "./tool-invocation-card";
import { DelegateInvocationCard } from "./delegate-invocation-card";
import { AssistantActivityGroup } from "./assistant-activity-group";
import { UserMessage } from "./user-message";
import { AssistantMessage } from "./assistant-message";
import type { BusinessPromptCategory } from "./business-prompt-library";
import { LoadingMessage } from "@/components/common/loading-message";
import { ErrorCard } from "../common/error-card";
import { NoKernelPrompt } from "../common/no-kernel-prompt";
import { parseChatApiErrorMessage } from "@/lib/chat/chat-api-errors";
import { ThinkingBlock } from "./thinking-block";
import { CostSummaryCard, type CostSummaryMessageData } from "./cost-summary-card";
import {
  buildAssistantActivityMessageBlocks,
  buildAssistantRenderBlocks,
  getActivityDurationMs,
  isActivityGroupWaitingForFinalResponse,
  shouldAutoCollapseActivityGroup,
  shouldForceExpandActivityGroup,
  type AssistantActivityMessagePart,
  type AssistantPartWithIndex,
  type ToolTiming,
} from "./assistant-activity-grouping";
import { Button } from "@/components/ui/button";
import {
  CheckmarkedButton,
  useCheckmarkedFeedback,
} from "@/components/common/checkmarked-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import type { ToolApprovalMode } from "@/lib/settings/schema";
import type { EditingState } from "./types";
import type { EditCheckpointStatus } from "@/lib/agent/edit-checkpoints";
import { dispatchInsertChatMessage } from "@/lib/chat/chat-composer-events";
import {
  formatAssistantMessageClipboardText,
  writeAssistantMessageToClipboard,
} from "@/lib/chat/chat-message-copy";

type CheckpointMessageAction = "restore" | "redo";

export interface ChatBodyProps {
  viewKey?: string;
  messages: UIMessage[];
  error: Error | undefined;
  isLoading: boolean;
  /** True while the assistant turn is still in progress (streaming, tools, follow-up gap). */
  isAgentTurnActive?: boolean;
  onUserMessageClick: (message: UIMessage, index: number) => void;
  editingState: EditingState | null;
  showKernelPrompt?: boolean;
  onOpenKernelDropdown?: () => void;
  onDismissKernelPrompt?: () => void;
  pendingApprovalIds?: Set<string>;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  toolApprovalMode?: ToolApprovalMode;
  onToolApprovalModeChange?: (mode: ToolApprovalMode) => void;
  /** Live progress descriptions for running sub-agent tool calls, keyed by toolCallId. */
  subagentProgress?: Map<string, string>;
  /** Tmp notebook report paths for sub-agent runs, keyed by delegate toolCallId. */
  subagentReportPaths?: Map<string, string>;
  /** Tool execution timings for the active browser session, keyed by toolCallId. */
  toolTimings?: Map<string, ToolTiming>;
  /** Group adjacent assistant activity-only messages into one compact work row. */
  groupConsecutiveAssistantActivity?: boolean;
  onOpenSubagentChat?: (toolCallId: string) => void;
  onOpenSubagentReport?: (path: string) => void;
  /** Ephemeral `/cost` slash-command rows keyed by assistant message id. */
  costSummaryByMessageId?: Record<string, CostSummaryMessageData>;
  onDismissCostSummary?: () => void;
  onRefreshCostSummary?: () => void;
  isRefreshingCostSummary?: boolean;
  checkpointStatuses?: Map<string, EditCheckpointStatus>;
  checkpointRequestByMessageId?: Map<string, string>;
  onRestoreCheckpoint?: (checkpointId: string, action: CheckpointMessageAction) => void;
  onForkFromAssistantMessage?: (message: UIMessage, index: number) => void;
  /** Optional prompt categories rendered when this chat has no rows. */
  emptyPromptCategories?: readonly BusinessPromptCategory[];
  /** Resets the prompt library when an empty chat is started again. */
  emptyPromptLibraryKey?: string;
}

interface ChatMessageRowProps {
  message: UIMessage;
  index: number;
  isLastMessage: boolean;
  isDimmed: boolean;
  /** True while another user message is being edited in the composer. */
  isEditing: boolean;
  isLoading: boolean;
  /** True while the assistant turn is still in progress (streaming, tools, follow-up gap). */
  isAgentTurnActive?: boolean;
  /** Prevents forks while any request for the current chat remains active. */
  isForkingDisabled?: boolean;
  onUserMessageClick: (message: UIMessage, index: number) => void;
  pendingApprovalIds?: Set<string>;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  toolApprovalMode?: ToolApprovalMode;
  onToolApprovalModeChange?: (mode: ToolApprovalMode) => void;
  subagentProgress?: Map<string, string>;
  subagentReportPaths?: Map<string, string>;
  toolTimings?: Map<string, ToolTiming>;
  onOpenSubagentChat?: (toolCallId: string) => void;
  onOpenSubagentReport?: (path: string) => void;
  costSummaryByMessageId?: Record<string, CostSummaryMessageData>;
  onDismissCostSummary?: () => void;
  onRefreshCostSummary?: () => void;
  isRefreshingCostSummary?: boolean;
  checkpointStatuses?: Map<string, EditCheckpointStatus>;
  checkpointRequestByMessageId?: Map<string, string>;
  onRestoreCheckpoint?: (checkpointId: string, action: CheckpointMessageAction) => void;
  onForkFromAssistantMessage?: (message: UIMessage, index: number) => void;
}

type ChatRenderItem =
  | { type: "message"; message: UIMessage; messageIndex: number }
  | {
    type: "activityRun";
    items: AssistantActivityMessagePart[];
    firstMessageIndex: number;
    lastMessageIndex: number;
    hasFollowingText: boolean;
  }
  | { type: "kernelPrompt" }
  | { type: "loading" }
  | {
    type: "error";
    title?: string;
    message: string | undefined;
    actionUrl?: string;
    actionLabel?: string;
  };

type ConversationSelectionSource = "assistant" | "tool";

type ConversationSelectionPopoverState = {
  selectedText: string;
  rect: DOMRect;
  source: ConversationSelectionSource;
  messageId: string;
  messageIndex: number;
  partIndex: number;
  toolName?: string;
  toolCallId?: string;
};

/** Finds the element carrying conversation-reference metadata for a text node. */
function closestConversationReferenceElement(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement
      ? node
      : node?.parentElement instanceof HTMLElement
        ? node.parentElement
        : null;
  return element?.closest<HTMLElement>("[data-orion-conversation-reference='true']") ?? null;
}

/** Finds the floating mention action, which lives outside the chat scroll root. */
function closestConversationMentionPopoverElement(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement
      ? node
      : node?.parentElement instanceof HTMLElement
        ? node.parentElement
        : null;
  return (
    element?.closest<HTMLElement>("[data-orion-conversation-mention-popover='true']") ?? null
  );
}

/** Reads a non-negative integer from a data attribute. */
function readDatasetIndex(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Builds a popover payload for a selection inside assistant or tool chat content. */
function getConversationSelectionState(
  root: HTMLElement,
  selection: Selection | null
): ConversationSelectionPopoverState | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const selectedText = selection.toString().trim();
  if (!selectedText) return null;

  const range = selection.getRangeAt(0);
  const referenceElement = closestConversationReferenceElement(range.commonAncestorContainer);
  if (!referenceElement || !root.contains(referenceElement)) return null;
  if (
    !referenceElement.contains(range.startContainer) ||
    !referenceElement.contains(range.endContainer)
  ) {
    return null;
  }

  const source = referenceElement.dataset.orionConversationSource;
  if (source !== "assistant" && source !== "tool") return null;

  const messageId = referenceElement.dataset.orionMessageId;
  const messageIndex = readDatasetIndex(referenceElement.dataset.orionMessageIndex);
  const partIndex = readDatasetIndex(referenceElement.dataset.orionPartIndex);
  if (!messageId || messageIndex === null || partIndex === null) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    selectedText,
    rect,
    source,
    messageId,
    messageIndex,
    partIndex,
    toolName: referenceElement.dataset.orionToolName,
    toolCallId: referenceElement.dataset.orionToolCallId,
  };
}

/** Floating action that turns highlighted assistant/tool text into a draft chat mention. */
function ConversationSelectionMentionPopover({
  rootRef,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [state, setState] = React.useState<ConversationSelectionPopoverState | null>(null);

  const updateFromSelection = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    setState(getConversationSelectionState(root, window.getSelection()));
  }, [rootRef]);

  React.useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setState(null);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const mentionSelection = React.useCallback(() => {
    if (!state) return;
    window.dispatchEvent(
      new CustomEvent("orion:mention-conversation-selection", {
        detail: {
          selectedText: state.selectedText,
          source: state.source,
          messageId: state.messageId,
          messageIndex: state.messageIndex,
          partIndex: state.partIndex,
          toolName: state.toolName,
          toolCallId: state.toolCallId,
        },
      })
    );
    window.getSelection()?.removeAllRanges();
    setState(null);
  }, [state]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const hidePopover = () => setState(null);
    const hideWhenClickingAway = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root.contains(target)) return;
      if (closestConversationMentionPopoverElement(target)) return;
      setState(null);
    };
    root.addEventListener("mouseup", updateFromSelection);
    root.addEventListener("keyup", updateFromSelection);
    root.addEventListener("scroll", hidePopover, true);
    document.addEventListener("mousedown", hideWhenClickingAway);
    return () => {
      root.removeEventListener("mouseup", updateFromSelection);
      root.removeEventListener("keyup", updateFromSelection);
      root.removeEventListener("scroll", hidePopover, true);
      document.removeEventListener("mousedown", hideWhenClickingAway);
    };
  }, [rootRef, updateFromSelection]);

  if (!state) return null;

  const left = Math.min(
    Math.max(state.rect.left + state.rect.width / 2, 48),
    window.innerWidth - 48
  );
  const top = Math.max(state.rect.top - 38, 8);

  return (
    <button
      type="button"
      className="corner-squircle fixed z-50 inline-flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md"
      data-orion-conversation-mention-popover="true"
      style={{ left, top }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={mentionSelection}
    >
      <AtSign className="h-3 w-3" />
      Mention in chat
    </button>
  );
}

/** Compare UI message parts by the fields that affect rendered chat rows. */
function areRenderedPartsEqual(prev: UIMessage["parts"], next: UIMessage["parts"]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;

  for (let index = 0; index < prev.length; index++) {
    const prevPart = prev[index];
    const nextPart = next[index];
    if (prevPart.type !== nextPart.type) return false;

    if (prevPart.type === "text" && nextPart.type === "text") {
      if (prevPart.text !== nextPart.text) return false;
      continue;
    }

    if (prevPart.type === "reasoning" && nextPart.type === "reasoning") {
      if (prevPart.text !== nextPart.text) return false;
      continue;
    }

    if (isToolUIPart(prevPart) && isToolUIPart(nextPart)) {
      if (prevPart.toolCallId !== nextPart.toolCallId) return false;
      if (prevPart.state !== nextPart.state) return false;
      if ("input" in prevPart && "input" in nextPart && prevPart.input !== nextPart.input) {
        return false;
      }
      if ("output" in prevPart && "output" in nextPart && prevPart.output !== nextPart.output) {
        return false;
      }
      if ("errorText" in prevPart && "errorText" in nextPart && prevPart.errorText !== nextPart.errorText) {
        return false;
      }
      continue;
    }
  }

  return true;
}

/** Compare row-scoped map values so parent Map identity changes do not rerender unrelated rows. */
function areToolMapValuesEqual(
  prevMessage: UIMessage,
  nextMessage: UIMessage,
  prevMap: Map<string, string> | undefined,
  nextMap: Map<string, string> | undefined
): boolean {
  if (prevMap === nextMap) return true;
  for (const part of nextMessage.parts) {
    if (!isToolUIPart(part)) continue;
    const prevValue = prevMap?.get(part.toolCallId);
    const nextValue = nextMap?.get(part.toolCallId);
    if (prevValue !== nextValue) return false;
  }
  for (const part of prevMessage.parts) {
    if (!isToolUIPart(part)) continue;
    if (nextMessage.parts.some((candidate) => isToolUIPart(candidate) && candidate.toolCallId === part.toolCallId)) {
      continue;
    }
    if (prevMap?.get(part.toolCallId) !== nextMap?.get(part.toolCallId)) return false;
  }
  return true;
}

/** Compare row-scoped timing values without depending on Map identity. */
function areToolTimingValuesEqual(
  prevMessage: UIMessage,
  nextMessage: UIMessage,
  prevMap: Map<string, ToolTiming> | undefined,
  nextMap: Map<string, ToolTiming> | undefined
): boolean {
  if (prevMap === nextMap) return true;

  const toolCallIds = new Set<string>();
  for (const msg of [prevMessage, nextMessage]) {
    for (const part of msg.parts) {
      if (isToolUIPart(part)) toolCallIds.add(part.toolCallId);
    }
  }

  for (const toolCallId of toolCallIds) {
    const prevValue = prevMap?.get(toolCallId);
    const nextValue = nextMap?.get(toolCallId);
    if (prevValue?.startedAt !== nextValue?.startedAt) return false;
    if (prevValue?.endedAt !== nextValue?.endedAt) return false;
  }

  return true;
}

/** Compare row-scoped approval membership without depending on Set identity. */
function arePendingApprovalValuesEqual(
  message: UIMessage,
  prevIds: Set<string> | undefined,
  nextIds: Set<string> | undefined
): boolean {
  if (prevIds === nextIds) return true;
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (prevIds?.has(part.toolCallId) !== nextIds?.has(part.toolCallId)) return false;
  }
  return true;
}

/** True while a tool part is still waiting for input, approval, or output. */
function isPendingToolState(state: string): boolean {
  return (
    state === "input-available" ||
    state === "input-streaming" ||
    state === "approval-requested" ||
    state === "approval-responded"
  );
}

/** Extract the leading text payload from a tool result for status detection. */
function leadingResultText(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === "string") {
    return result[0];
  }
  return null;
}

/** Detect tool errors represented either structurally or as legacy text prefixes. */
function toolOutputIsError(result: unknown, leadingText: string | null): boolean {
  if (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    "error" in result
  ) {
    return true;
  }
  return leadingText != null && leadingText.startsWith("[ERROR");
}

/** Resolve the aggregate status shown on a compact activity group. */
function getActivityStatus(
  items: AssistantPartWithIndex[],
  pendingApprovalIds: Set<string> | undefined
): "running" | "approval" | "error" | "warning" | "complete" {
  let hasPending = false;
  let hasApproval = false;
  let hasError = false;
  let hasWarning = false;

  for (const item of items) {
    if (!isToolUIPart(item.part)) continue;
    const state = String(item.part.state);
    const result = "output" in item.part ? item.part.output : undefined;
    const leadingText = leadingResultText(result);
    if (pendingApprovalIds?.has(item.part.toolCallId) || state === "approval-requested") {
      hasApproval = true;
    }
    if (isPendingToolState(state)) {
      hasPending = true;
    }
    if (
      state === "output-error" ||
      state === "output-denied" ||
      toolOutputIsError(result, leadingText)
    ) {
      hasError = true;
    }
    if (leadingText != null && leadingText.startsWith("[WARNING")) {
      hasWarning = true;
    }
  }

  if (hasApproval) return "approval";
  if (hasPending) return "running";
  if (hasError) return "error";
  if (hasWarning) return "warning";
  return "complete";
}

/** True while this reasoning part is still the tail of an in-flight assistant turn. */
function isReasoningPartActivelyStreaming({
  isLoading,
  isLastMessage,
  hasFollowingText,
  hasPartsAfter,
}: {
  isLoading: boolean;
  isLastMessage: boolean;
  hasFollowingText: boolean;
  hasPartsAfter: boolean;
}): boolean {
  return isLoading && isLastMessage && !hasFollowingText && !hasPartsAfter;
}

interface ActivityItemRenderOptions {
  item: AssistantActivityMessagePart;
  isLoading: boolean;
  isLastMessage: boolean;
  messageHasFollowingText: boolean;
  hasPartsAfter: boolean;
  pendingApprovalIds?: Set<string>;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  toolApprovalMode?: ToolApprovalMode;
  onToolApprovalModeChange?: (mode: ToolApprovalMode) => void;
  subagentProgress?: Map<string, string>;
  subagentReportPaths?: Map<string, string>;
  onOpenSubagentChat?: (toolCallId: string) => void;
  onOpenSubagentReport?: (path: string) => void;
}

/** Render one activity part using its original message reference metadata. */
function renderAssistantActivityItem({
  item,
  isLoading,
  isLastMessage,
  messageHasFollowingText,
  hasPartsAfter,
  pendingApprovalIds,
  onApprove,
  onReject,
  toolApprovalMode,
  onToolApprovalModeChange,
  subagentProgress,
  subagentReportPaths,
  onOpenSubagentChat,
  onOpenSubagentReport,
}: ActivityItemRenderOptions) {
  const { part, partIndex, message, messageIndex } = item;
  if (isToolUIPart(part)) {
    const inv = part;
    const toolName = inv.type.slice(5) as OrionToolName;
    const invArgs =
      ("input" in inv && inv.input != null) ? (inv.input as Record<string, unknown>) : {};
    const invResult = "output" in inv ? inv.output : undefined;
    const invErrorText =
      "errorText" in inv && typeof inv.errorText === "string" ? inv.errorText : undefined;

    if (toolName === "delegate") {
      return (
        <DelegateInvocationCard
          key={inv.toolCallId}
          subagentType={(invArgs.subagent as string | undefined) ?? ""}
          progressDescription={subagentProgress?.get(inv.toolCallId)}
          result={invResult}
          state={inv.state}
          reportPath={subagentReportPaths?.get(inv.toolCallId)}
          onShowReport={onOpenSubagentReport}
          onOpenSubchat={
            onOpenSubagentChat
              ? () => onOpenSubagentChat(inv.toolCallId)
              : undefined
          }
          conversationReference={{
            messageId: message.id,
            messageIndex,
            partIndex,
            toolCallId: inv.toolCallId,
          }}
        />
      );
    }

    return (
      <ToolInvocationCard
        key={inv.toolCallId}
        toolName={toolName}
        args={invArgs}
        result={invResult}
        state={inv.state}
        errorText={invErrorText}
        pendingApproval={pendingApprovalIds?.has(inv.toolCallId)}
        onApprove={onApprove ? () => onApprove(inv.toolCallId) : undefined}
        onReject={onReject ? () => onReject(inv.toolCallId) : undefined}
        toolApprovalMode={toolApprovalMode}
        onToolApprovalModeChange={onToolApprovalModeChange}
        conversationReference={{
          messageId: message.id,
          messageIndex,
          partIndex,
          toolCallId: inv.toolCallId,
        }}
      />
    );
  }

  if (part.type === "text" && part.text) {
    const isActivelyStreaming =
      isLoading && isLastMessage && !messageHasFollowingText && !hasPartsAfter;

    return (
      <AssistantMessage
        key={`${message.id}-work-text-${partIndex}`}
        content={part.text}
        isStreaming={isActivelyStreaming}
        conversationReference={{
          messageId: message.id,
          messageIndex,
          partIndex,
        }}
      />
    );
  }

  if (part.type === "reasoning" && part.text) {
    const isActivelyThinking = isReasoningPartActivelyStreaming({
      isLoading,
      isLastMessage,
      hasFollowingText: messageHasFollowingText,
      hasPartsAfter,
    });

    return (
      <ThinkingBlock
        key={`${message.id}-reasoning-${partIndex}`}
        reasoning={part.text}
        isStreaming={isActivelyThinking}
      />
    );
  }

  return null;
}

interface AssistantActivityRunRowProps {
  item: Extract<ChatRenderItem, { type: "activityRun" }>;
  isLastMessage: boolean;
  isLoading: boolean;
  isAgentTurnActive?: boolean;
  pendingApprovalIds?: Set<string>;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  toolApprovalMode?: ToolApprovalMode;
  onToolApprovalModeChange?: (mode: ToolApprovalMode) => void;
  subagentProgress?: Map<string, string>;
  subagentReportPaths?: Map<string, string>;
  toolTimings?: Map<string, ToolTiming>;
  onOpenSubagentChat?: (toolCallId: string) => void;
  onOpenSubagentReport?: (path: string) => void;
}

/** Render a compact group spanning consecutive assistant activity-only messages. */
function AssistantActivityRunRow({
  item,
  isLastMessage,
  isLoading,
  isAgentTurnActive = false,
  pendingApprovalIds,
  onApprove,
  onReject,
  toolApprovalMode,
  onToolApprovalModeChange,
  subagentProgress,
  subagentReportPaths,
  toolTimings,
  onOpenSubagentChat,
  onOpenSubagentReport,
}: AssistantActivityRunRowProps) {
  const status = getActivityStatus(item.items, pendingApprovalIds);
  const hasPendingApproval = status === "approval";
  const toolCount = item.items.filter((activityItem) => isToolUIPart(activityItem.part)).length;
  const isWaitingForFinalResponse = isActivityGroupWaitingForFinalResponse({
    hasFollowingText: item.hasFollowingText,
    isLastMessage,
    activityStatus: status,
    isTurnActive: isAgentTurnActive,
  });

  return (
    <div className="flex min-w-0 w-full justify-start">
      <div className="w-full min-w-0">
        <AssistantActivityGroup
          toolCount={toolCount}
          durationMs={getActivityDurationMs(item.items, toolTimings, {
            isActivityComplete: !isWaitingForFinalResponse,
          })}
          isWaitingForFinalResponse={isWaitingForFinalResponse}
          autoCollapse={shouldAutoCollapseActivityGroup(item.hasFollowingText, hasPendingApproval)}
          forceExpanded={shouldForceExpandActivityGroup(hasPendingApproval)}
        >
          {item.items.map((activityItem, activityIndex) =>
            renderAssistantActivityItem({
              item: activityItem,
              isLoading,
              isLastMessage,
              messageHasFollowingText: item.hasFollowingText,
              hasPartsAfter: activityIndex < item.items.length - 1,
              pendingApprovalIds,
              onApprove,
              onReject,
              toolApprovalMode,
              onToolApprovalModeChange,
              subagentProgress,
              subagentReportPaths,
              onOpenSubagentChat,
              onOpenSubagentReport,
            })
          )}
        </AssistantActivityGroup>
      </div>
    </div>
  );
}

interface AssistantMessageActionsProps {
  message: UIMessage;
  onForkFromAssistantMessage?: () => void;
}

/** Renders the stable copy and fork controls below a completed assistant response. */
function AssistantMessageActions({
  message,
  onForkFromAssistantMessage,
}: AssistantMessageActionsProps) {
  const { checked: isCopied, showCheckmark } = useCheckmarkedFeedback();

  /** Copy the assistant's raw Markdown text and show transient success feedback. */
  const handleCopy = React.useCallback(async () => {
    try {
      await writeAssistantMessageToClipboard(message);
      showCheckmark();
    } catch (error) {
      console.error("Failed to copy assistant message:", error);
    }
  }, [message, showCheckmark]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 px-1">
        {onForkFromAssistantMessage ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onForkFromAssistantMessage}
                aria-label="Fork from here"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
              >
                <GitFork />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              <p>Fork from here</p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <CheckmarkedButton
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              aria-label="Copy message"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
              checked={isCopied}
              icon={<Copy />}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>{isCopied ? "Copied!" : "Copy message"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/**
 * Render one chat row. Historical rows are memoized because AI SDK streaming
 * can clone message objects on every chunk.
 */
const ChatMessageRow = React.memo(function ChatMessageRow({
  message,
  index,
  isLastMessage,
  isDimmed,
  isEditing,
  isLoading,
  isAgentTurnActive = false,
  isForkingDisabled = false,
  onUserMessageClick,
  pendingApprovalIds,
  onApprove,
  onReject,
  toolApprovalMode,
  onToolApprovalModeChange,
  subagentProgress,
  subagentReportPaths,
  toolTimings,
  onOpenSubagentChat,
  onOpenSubagentReport,
  costSummaryByMessageId,
  onDismissCostSummary,
  onRefreshCostSummary,
  isRefreshingCostSummary,
  checkpointStatuses,
  checkpointRequestByMessageId,
  onRestoreCheckpoint,
  onForkFromAssistantMessage,
}: ChatMessageRowProps) {
  const handleUserClick = React.useCallback(() => {
    onUserMessageClick(message, index);
  }, [index, message, onUserMessageClick]);
  const handleForkFromAssistantMessage = React.useCallback(() => {
    if (message.role !== "assistant") return;
    onForkFromAssistantMessage?.(message, index);
  }, [index, message, onForkFromAssistantMessage]);

  const costSummary = costSummaryByMessageId?.[message.id];
  const messageCheckpointId = checkpointRequestByMessageId?.get(message.id);
  const checkpointStatus = messageCheckpointId
    ? checkpointStatuses?.get(messageCheckpointId)
    : undefined;
  const checkpointAction: CheckpointMessageAction | undefined =
    checkpointStatus === "reverted"
      ? "redo"
      : checkpointStatus
        ? "restore"
        : undefined;
  const actionableCheckpointId = checkpointAction ? messageCheckpointId : undefined;

  /** Render one grouped reasoning/tool part using the existing detailed components. */
  const renderActivityItem = (item: AssistantPartWithIndex) => {
    const { part, partIndex } = item;
    if (part.type === "reasoning" && part.text) {
      const hasTextAfter = message.parts
        .slice(partIndex + 1)
        .some((p) => p.type === "text" && "text" in p && p.text);
      return renderAssistantActivityItem({
        item: { ...item, message, messageIndex: index },
        isLoading,
        isLastMessage,
        messageHasFollowingText: hasTextAfter,
        hasPartsAfter: partIndex < message.parts.length - 1,
        pendingApprovalIds,
        onApprove,
        onReject,
        toolApprovalMode,
        onToolApprovalModeChange,
        subagentProgress,
        subagentReportPaths,
        onOpenSubagentChat,
        onOpenSubagentReport,
      });
    }

    return renderAssistantActivityItem({
      item: { ...item, message, messageIndex: index },
      isLoading,
      isLastMessage,
      messageHasFollowingText: false,
      hasPartsAfter: partIndex < message.parts.length - 1,
      pendingApprovalIds,
      onApprove,
      onReject,
      toolApprovalMode,
      onToolApprovalModeChange,
      subagentProgress,
      subagentReportPaths,
      onOpenSubagentChat,
      onOpenSubagentReport,
    });
  };

  const renderBlocks = message.role === "assistant"
    ? buildAssistantRenderBlocks(message.parts)
    : [];
  const hasAssistantProse = Boolean(formatAssistantMessageClipboardText(message).trim());
  const showAssistantActions =
    message.role === "assistant" &&
    !costSummary &&
    hasAssistantProse &&
    !isLoading &&
    !isAgentTurnActive;

  return (
    <div
      className={`flex min-w-0 w-full ${message.role === "user" ? "justify-end" : "justify-start"
        } transition-opacity ${isDimmed ? "opacity-50" : ""}`}
    >
      {message.role === "user" ? (
        <UserMessage
          message={message}
          onClick={handleUserClick}
          isClickable={true}
          checkpointId={actionableCheckpointId}
          checkpointAction={checkpointAction}
          onRestoreCheckpoint={onRestoreCheckpoint}
        />
      ) : costSummary ? (
        <CostSummaryCard
          summary={costSummary.summary}
          modelLabels={costSummary.modelLabels}
          onDismiss={onDismissCostSummary}
          onRefresh={onRefreshCostSummary}
          isRefreshing={isRefreshingCostSummary}
        />
      ) : (
        <div className="w-full min-w-0 space-y-2">
          {/* Render assistant text and grouped activity in chronological order. */}
          {renderBlocks.map((block, blockIndex) => {
            if (block.type === "text") {
              return (
                <AssistantMessage
                  key={`${message.id}-text-${block.item.partIndex}`}
                  content={block.item.part.text}
                  isStreaming={isLoading && isLastMessage}
                  conversationReference={{
                    messageId: message.id,
                    messageIndex: index,
                    partIndex: block.item.partIndex,
                  }}
                />
              );
            }

            const status = getActivityStatus(block.items, pendingApprovalIds);
            const hasPendingApproval = status === "approval";
            const toolCount = block.items.filter((item) => isToolUIPart(item.part)).length;
            const isWaitingForFinalResponse = isActivityGroupWaitingForFinalResponse({
              hasFollowingText: block.hasFollowingText,
              isLastMessage,
              activityStatus: status,
              isTurnActive: isAgentTurnActive,
            });
            return (
              <AssistantActivityGroup
                key={`${message.id}-activity-${block.items[0]?.partIndex ?? blockIndex}`}
                toolCount={toolCount}
                durationMs={getActivityDurationMs(block.items, toolTimings, {
                  isActivityComplete: !isWaitingForFinalResponse,
                })}
                isWaitingForFinalResponse={isWaitingForFinalResponse}
                autoCollapse={shouldAutoCollapseActivityGroup(block.hasFollowingText, hasPendingApproval)}
                forceExpanded={shouldForceExpandActivityGroup(hasPendingApproval)}
              >
                {block.items.map(renderActivityItem)}
              </AssistantActivityGroup>
            );
          })}
          {showAssistantActions ? (
            <AssistantMessageActions
              message={message}
              onForkFromAssistantMessage={
                !isEditing && !isForkingDisabled && onForkFromAssistantMessage
                  ? handleForkFromAssistantMessage
                  : undefined
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.role !== next.message.role) return false;
  if (prev.index !== next.index) return false;
  if (prev.isLastMessage !== next.isLastMessage) return false;
  if (prev.isDimmed !== next.isDimmed) return false;
  if (prev.isEditing !== next.isEditing) return false;
  if (prev.isForkingDisabled !== next.isForkingDisabled) return false;

  const prevEffectiveLoading = prev.isLastMessage ? prev.isLoading : false;
  const nextEffectiveLoading = next.isLastMessage ? next.isLoading : false;
  if (prevEffectiveLoading !== nextEffectiveLoading) return false;
  const prevTurnActive = prev.isLastMessage ? (prev.isAgentTurnActive ?? false) : false;
  const nextTurnActive = next.isLastMessage ? (next.isAgentTurnActive ?? false) : false;
  if (prevTurnActive !== nextTurnActive) return false;
  if (next.isLastMessage && (next.isLoading || next.isAgentTurnActive)) {
    return false;
  }

  if (!areRenderedPartsEqual(prev.message.parts, next.message.parts)) return false;
  if (prev.message.metadata !== next.message.metadata) return false;
  if (!arePendingApprovalValuesEqual(next.message, prev.pendingApprovalIds, next.pendingApprovalIds)) {
    return false;
  }
  if (!areToolMapValuesEqual(prev.message, next.message, prev.subagentProgress, next.subagentProgress)) {
    return false;
  }
  if (!areToolMapValuesEqual(prev.message, next.message, prev.subagentReportPaths, next.subagentReportPaths)) {
    return false;
  }
  if (!areToolTimingValuesEqual(prev.message, next.message, prev.toolTimings, next.toolTimings)) {
    return false;
  }
  if (prev.toolApprovalMode !== next.toolApprovalMode) return false;
  if (prev.onToolApprovalModeChange !== next.onToolApprovalModeChange) return false;
  if (prev.costSummaryByMessageId?.[prev.message.id] !== next.costSummaryByMessageId?.[next.message.id]) {
    return false;
  }
  if (prev.isRefreshingCostSummary !== next.isRefreshingCostSummary) return false;
  const prevCheckpointId = prev.checkpointRequestByMessageId?.get(prev.message.id);
  const nextCheckpointId = next.checkpointRequestByMessageId?.get(next.message.id);
  if (prevCheckpointId !== nextCheckpointId) return false;
  if (
    prevCheckpointId &&
    prev.checkpointStatuses?.get(prevCheckpointId) !== next.checkpointStatuses?.get(prevCheckpointId)
  ) {
    return false;
  }
  if (prev.onRestoreCheckpoint !== next.onRestoreCheckpoint) return false;
  if (prev.onForkFromAssistantMessage !== next.onForkFromAssistantMessage) return false;

  return true;
});

interface EmptyChatPromptStateProps {
  categories: readonly BusinessPromptCategory[];
}

/** Renders a compact accordion prompt library for an empty business chat. */
function EmptyChatPromptState({
  categories,
}: EmptyChatPromptStateProps): React.JSX.Element {
  const [expandedCategoryId, setExpandedCategoryId] = React.useState<
    BusinessPromptCategory["id"] | null
  >(null);

  const handleSuggestionClick = React.useCallback((prompt: string) => {
    dispatchInsertChatMessage(prompt);
  }, []);

  const handleCategoryClick = React.useCallback(
    (categoryId: BusinessPromptCategory["id"]) => {
      setExpandedCategoryId((current) =>
        current === categoryId ? null : categoryId
      );
    },
    []
  );

  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center px-2 py-8">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          What should Orion work on?
        </h2>
        <div
          aria-label="Prompt categories"
          className="mt-6 grid w-full gap-2 text-left"
        >
          {categories.map((category) => {
            const CategoryIcon = category.icon;
            const isExpanded = expandedCategoryId === category.id;
            const promptListId = `prompt-category-${category.id}`;

            return (
              <div key={category.id}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={promptListId}
                  aria-label={`Toggle prompt category: ${category.title}`}
                  className="corner-squircle flex w-full items-start gap-3 rounded-md border border-border/70 bg-background/80 px-3 py-2.5 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handleCategoryClick(category.id)}
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                    <CategoryIcon aria-hidden="true" className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-foreground">
                      {category.title}
                    </span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                      {category.description}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""
                      }`}
                  />
                </button>
                <div
                  id={promptListId}
                  role="region"
                  aria-label={`Prompt suggestions for ${category.title}`}
                  aria-hidden={!isExpanded}
                  className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className={`mt-1 grid gap-0.5 py-1 pl-9 transition-opacity duration-150 ${isExpanded ? "opacity-100" : "pointer-events-none opacity-0"
                        }`}
                    >
                      {category.prompts.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          tabIndex={isExpanded ? 0 : -1}
                          aria-label={`Use prompt suggestion: ${suggestion.title}`}
                          className="w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:text-foreground"
                          onClick={() => handleSuggestionClick(suggestion.prompt)}
                        >
                          {suggestion.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChatBody({
  viewKey = "chat",
  messages,
  error,
  isLoading,
  isAgentTurnActive = false,
  onUserMessageClick,
  editingState,
  showKernelPrompt,
  onOpenKernelDropdown,
  onDismissKernelPrompt,
  pendingApprovalIds,
  onApprove,
  onReject,
  toolApprovalMode,
  onToolApprovalModeChange,
  subagentProgress,
  subagentReportPaths,
  toolTimings,
  groupConsecutiveAssistantActivity = false,
  onOpenSubagentChat,
  onOpenSubagentReport,
  costSummaryByMessageId,
  onDismissCostSummary,
  onRefreshCostSummary,
  isRefreshingCostSummary,
  checkpointStatuses,
  checkpointRequestByMessageId,
  onRestoreCheckpoint,
  onForkFromAssistantMessage,
  emptyPromptCategories,
  emptyPromptLibraryKey,
}: ChatBodyProps) {
  const scrollParentRef = React.useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = React.useRef(true);
  const previousViewKeyRef = React.useRef(viewKey);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const showError = !isLoading && error && messages.at(-1)?.role === "user";

  const parsedApiError = React.useMemo(
    () => parseChatApiErrorMessage(error?.message),
    [error?.message]
  );
  const errorMessage = parsedApiError?.message ?? error?.message;
  const errorTitle = parsedApiError?.title;
  const errorActionUrl = parsedApiError?.actionUrl;
  const errorActionLabel = parsedApiError?.actionLabel;

  const rowItems = React.useMemo<ChatRenderItem[]>(() => {
    const rows: ChatRenderItem[] = buildAssistantActivityMessageBlocks(messages, {
      groupConsecutiveActivityOnlyMessages: groupConsecutiveAssistantActivity,
    });

    if (showKernelPrompt) {
      rows.push({ type: "kernelPrompt" });
    }
    if (isLoading) {
      rows.push({ type: "loading" });
    }
    if (showError) {
      rows.push({
        type: "error",
        title: errorTitle,
        message: errorMessage,
        actionUrl: errorActionUrl,
        actionLabel: errorActionLabel,
      });
    }

    return rows;
  }, [
    messages,
    groupConsecutiveAssistantActivity,
    showKernelPrompt,
    isLoading,
    showError,
    errorMessage,
    errorTitle,
    errorActionUrl,
    errorActionLabel,
  ]);

  const rowVirtualizer = useVirtualizer({
    count: rowItems.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) =>
      rowItems[index]?.type === "message" || rowItems[index]?.type === "activityRun"
        ? 180
        : 80,
    getItemKey: (index) => {
      const item = rowItems[index];
      if (!item) return `${viewKey}:missing:${index}`;
      if (item.type === "message") {
        return `${viewKey}:${item.message.id || "message"}:${item.messageIndex}`;
      }
      if (item.type === "activityRun") {
        const first = item.items[0]?.message.id ?? "activity";
        const last = item.items.at(-1)?.message.id ?? first;
        return `${viewKey}:activity-run:${first}:${last}:${item.firstMessageIndex}-${item.lastMessageIndex}`;
      }
      return `${viewKey}:${item.type}`;
    },
    overscan: 4,
    paddingStart: 16,
    paddingEnd: 16,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const showEmptyPromptState =
    rowItems.length === 0 && Boolean(emptyPromptCategories?.length);

  /** Check whether a scroll container is close enough to its bottom edge. */
  const isElementAtBottom = React.useCallback((element: HTMLDivElement) => {
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceFromBottom <= 48;
  }, []);

  /** Store bottom state in both a ref and React state for render-time controls. */
  const setBottomState = React.useCallback((nextIsAtBottom: boolean) => {
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom(nextIsAtBottom);
  }, []);

  /** Update whether the chat scroller is close enough to the bottom. */
  const updateBottomState = React.useCallback(() => {
    const element = scrollParentRef.current;
    if (!element) return;

    setBottomState(isElementAtBottom(element));
  }, [isElementAtBottom, setBottomState]);

  /** Move the virtualized list to the newest rendered row without animation. */
  const scrollToBottomNow = React.useCallback(() => {
    const element = scrollParentRef.current;
    if (!element) return;

    const lastIndex = rowItems.length - 1;
    if (lastIndex >= 0) {
      rowVirtualizer.scrollToIndex(lastIndex, { align: "end" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
    setBottomState(true);
  }, [rowItems.length, rowVirtualizer, setBottomState]);

  /** Jump to the newest message in the chat list. */
  const scrollToBottom = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      scrollToBottomNow();
      updateBottomState();
    });
  }, [scrollToBottomNow, updateBottomState]);

  React.useLayoutEffect(() => {
    if (previousViewKeyRef.current !== viewKey) {
      previousViewKeyRef.current = viewKey;
      scrollToBottomNow();
      return;
    }

    if (!isAtBottomRef.current) {
      updateBottomState();
      return;
    }

    scrollToBottomNow();
  }, [rowItems, scrollToBottomNow, updateBottomState, viewKey]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(updateBottomState);
    return () => window.cancelAnimationFrame(frame);
  }, [rowItems.length, updateBottomState]);

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <ConversationSelectionMentionPopover rootRef={scrollParentRef} />
      <div
        ref={scrollParentRef}
        className="h-full min-w-0 overflow-x-hidden overflow-y-auto px-4"
        onScroll={updateBottomState}
      >
        {showEmptyPromptState && emptyPromptCategories ? (
          <EmptyChatPromptState
            key={emptyPromptLibraryKey ?? viewKey}
            categories={emptyPromptCategories}
          />
        ) : null}
        <div
          className="relative min-w-0"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map((virtualRow) => {
            const item = rowItems[virtualRow.index];
            if (!item) return null;

            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 w-full pb-4"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {item.type === "message" && (
                  <ChatMessageRow
                    message={item.message}
                    index={item.messageIndex}
                    isLastMessage={item.messageIndex === messages.length - 1}
                    isDimmed={
                      !!editingState && editingState.messageId !== item.message.id
                    }
                    isEditing={editingState !== null}
                    isLoading={isLoading && item.messageIndex === messages.length - 1}
                    isAgentTurnActive={
                      isAgentTurnActive && item.messageIndex === messages.length - 1
                    }
                    isForkingDisabled={isAgentTurnActive || isLoading}
                    onUserMessageClick={onUserMessageClick}
                    pendingApprovalIds={pendingApprovalIds}
                    onApprove={onApprove}
                    onReject={onReject}
                    toolApprovalMode={toolApprovalMode}
                    onToolApprovalModeChange={onToolApprovalModeChange}
                    subagentProgress={subagentProgress}
                    subagentReportPaths={subagentReportPaths}
                    toolTimings={toolTimings}
                    onOpenSubagentChat={onOpenSubagentChat}
                    onOpenSubagentReport={onOpenSubagentReport}
                    costSummaryByMessageId={costSummaryByMessageId}
                    onDismissCostSummary={onDismissCostSummary}
                    onRefreshCostSummary={onRefreshCostSummary}
                    isRefreshingCostSummary={isRefreshingCostSummary}
                    checkpointStatuses={checkpointStatuses}
                    checkpointRequestByMessageId={checkpointRequestByMessageId}
                    onRestoreCheckpoint={onRestoreCheckpoint}
                    onForkFromAssistantMessage={onForkFromAssistantMessage}
                  />
                )}

                {item.type === "activityRun" && (
                  <AssistantActivityRunRow
                    item={item}
                    isLastMessage={item.lastMessageIndex === messages.length - 1}
                    isLoading={isLoading && item.lastMessageIndex === messages.length - 1}
                    isAgentTurnActive={
                      isAgentTurnActive && item.lastMessageIndex === messages.length - 1
                    }
                    pendingApprovalIds={pendingApprovalIds}
                    onApprove={onApprove}
                    onReject={onReject}
                    toolApprovalMode={toolApprovalMode}
                    onToolApprovalModeChange={onToolApprovalModeChange}
                    subagentProgress={subagentProgress}
                    subagentReportPaths={subagentReportPaths}
                    toolTimings={toolTimings}
                    onOpenSubagentChat={onOpenSubagentChat}
                    onOpenSubagentReport={onOpenSubagentReport}
                  />
                )}

                {item.type === "kernelPrompt" && (
                  <div className="flex justify-start">
                    <NoKernelPrompt
                      onConnect={onOpenKernelDropdown}
                      onDismiss={onDismissKernelPrompt}
                    />
                  </div>
                )}

                {item.type === "loading" && <LoadingMessage />}

                {item.type === "error" && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%]">
                      <ErrorCard
                        title={item.title}
                        message={item.message}
                        actionUrl={item.actionUrl}
                        actionLabel={item.actionLabel}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isAtBottom && messages.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute bottom-3 right-3 z-10 h-7 w-7 rounded-full bg-background/95 text-muted-foreground shadow-md backdrop-blur hover:text-foreground [&_svg]:size-3.5"
          aria-label="Scroll to bottom"
          onClick={scrollToBottom}
        >
          <ArrowDown />
        </Button>
      )}
    </div>
  );
}
