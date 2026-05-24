"use client";

import * as React from "react";
import { type UIMessage, isToolUIPart } from "ai";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, AtSign } from "lucide-react";
import { ToolInvocationCard } from "./tool-invocation-card";
import { DelegateInvocationCard } from "./delegate-invocation-card";
import { UserMessage } from "./user-message";
import { AssistantMessage } from "./assistant-message";
import { LoadingMessage } from "@/components/common/loading-message";
import { ErrorCard } from "../common/error-card";
import { NoKernelPrompt } from "../common/no-kernel-prompt";
import { ThinkingBlock } from "./thinking-block";
import { Button } from "@/components/ui/button";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import type { ToolApprovalMode } from "@/lib/settings/schema";
import type { EditingState } from "./types";

export interface ChatBodyProps {
  viewKey?: string;
  messages: UIMessage[];
  error: Error | undefined;
  isLoading: boolean;
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
  onOpenSubagentChat?: (toolCallId: string) => void;
  onOpenSubagentReport?: (path: string) => void;
}

interface ChatMessageRowProps {
  message: UIMessage;
  index: number;
  isLastMessage: boolean;
  isDimmed: boolean;
  isLoading: boolean;
  onUserMessageClick: (message: UIMessage, index: number) => void;
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

type ChatRenderItem =
  | { type: "message"; message: UIMessage; messageIndex: number }
  | { type: "kernelPrompt" }
  | { type: "loading" }
  | { type: "error"; message: string | undefined };

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

/**
 * Render one chat row. Historical rows are memoized because AI SDK streaming
 * can clone message objects on every chunk.
 */
const ChatMessageRow = React.memo(function ChatMessageRow({
  message,
  index,
  isLastMessage,
  isDimmed,
  isLoading,
  onUserMessageClick,
  pendingApprovalIds,
  onApprove,
  onReject,
  toolApprovalMode,
  onToolApprovalModeChange,
  subagentProgress,
  subagentReportPaths,
  onOpenSubagentChat,
  onOpenSubagentReport,
}: ChatMessageRowProps) {
  const handleUserClick = React.useCallback(() => {
    onUserMessageClick(message, index);
  }, [index, message, onUserMessageClick]);

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
        />
      ) : (
        <div className="w-full min-w-0 space-y-2">
          {/* Render parts in chronological order (text, tool calls, etc.) */}
          {message.parts.map((part, partIndex) => {
            if (isToolUIPart(part)) {
              const inv = part;
              // Extract tool name from part type ("tool-execute_code" -> "execute_code")
              const toolName = inv.type.slice(5) as OrionToolName;
              const invArgs = ("input" in inv && inv.input != null) ? (inv.input as Record<string, unknown>) : {};
              const invResult = "output" in inv ? inv.output : undefined;

              // Delegate tool gets a dedicated card with live progress
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
                      messageIndex: index,
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
                  pendingApproval={pendingApprovalIds?.has(inv.toolCallId)}
                  onApprove={onApprove ? () => onApprove(inv.toolCallId) : undefined}
                  onReject={onReject ? () => onReject(inv.toolCallId) : undefined}
                  toolApprovalMode={toolApprovalMode}
                  onToolApprovalModeChange={onToolApprovalModeChange}
                  conversationReference={{
                    messageId: message.id,
                    messageIndex: index,
                    partIndex,
                    toolCallId: inv.toolCallId,
                  }}
                />
              );
            }
            if (part.type === "text" && part.text) {
              return (
                <AssistantMessage
                  key={`${message.id}-text-${partIndex}`}
                  content={part.text}
                  isStreaming={isLoading && isLastMessage}
                  conversationReference={{
                    messageId: message.id,
                    messageIndex: index,
                    partIndex,
                  }}
                />
              );
            }
            if (part.type === "reasoning" && part.text) {
              const hasTextAfter = message.parts
                .slice(partIndex + 1)
                .some((p) => p.type === "text" && "text" in p && p.text);
              const isActivelyThinking =
                isLoading && isLastMessage && !hasTextAfter;

              return (
                <ThinkingBlock
                  key={`${message.id}-reasoning-${partIndex}`}
                  reasoning={part.text}
                  isStreaming={isActivelyThinking}
                />
              );
            }
            return null;
          })}
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

  const prevEffectiveLoading = prev.isLastMessage ? prev.isLoading : false;
  const nextEffectiveLoading = next.isLastMessage ? next.isLoading : false;
  if (prevEffectiveLoading !== nextEffectiveLoading) return false;
  if (next.isLastMessage && next.isLoading) {
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
  if (prev.toolApprovalMode !== next.toolApprovalMode) return false;
  if (prev.onToolApprovalModeChange !== next.onToolApprovalModeChange) return false;

  return true;
});

export function ChatBody({
  viewKey = "chat",
  messages,
  error,
  isLoading,
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
  onOpenSubagentChat,
  onOpenSubagentReport,
}: ChatBodyProps) {
  const scrollParentRef = React.useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = React.useRef(true);
  const previousViewKeyRef = React.useRef(viewKey);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const showError = !isLoading && error && messages.at(-1)?.role === "user";

  let errorMessage = error?.message;

  if (showError && error?.message) {
    try {
      const parsedError = JSON.parse(error.message);
      errorMessage = `${parsedError.title}: ${parsedError.message}`;
    } catch (e) {
      // Not a JSON error message, so we'll leave it as is.
      // This can happen for network errors or other non-API issues.
    }
  }

  const rowItems = React.useMemo<ChatRenderItem[]>(() => {
    const rows: ChatRenderItem[] = messages.map((message, index) => ({
      type: "message",
      message,
      messageIndex: index,
    }));

    if (showKernelPrompt) {
      rows.push({ type: "kernelPrompt" });
    }
    if (isLoading) {
      rows.push({ type: "loading" });
    }
    if (showError) {
      rows.push({ type: "error", message: errorMessage });
    }

    return rows;
  }, [messages, showKernelPrompt, isLoading, showError, errorMessage]);

  const rowVirtualizer = useVirtualizer({
    count: rowItems.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => (rowItems[index]?.type === "message" ? 180 : 80),
    getItemKey: (index) => {
      const item = rowItems[index];
      if (!item) return `${viewKey}:missing:${index}`;
      if (item.type === "message") {
        return `${viewKey}:${item.message.id || "message"}:${item.messageIndex}`;
      }
      return `${viewKey}:${item.type}`;
    },
    overscan: 4,
    paddingStart: 16,
    paddingEnd: 16,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();

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
                    isLoading={isLoading && item.messageIndex === messages.length - 1}
                    onUserMessageClick={onUserMessageClick}
                    pendingApprovalIds={pendingApprovalIds}
                    onApprove={onApprove}
                    onReject={onReject}
                    toolApprovalMode={toolApprovalMode}
                    onToolApprovalModeChange={onToolApprovalModeChange}
                    subagentProgress={subagentProgress}
                    subagentReportPaths={subagentReportPaths}
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
                      <ErrorCard message={item.message} />
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
