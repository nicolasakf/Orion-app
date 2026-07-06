import { isToolUIPart, type UIMessage } from "ai";

export interface ToolTiming {
  startedAt: number;
  endedAt?: number;
}

export type AssistantPartWithIndex = {
  part: UIMessage["parts"][number];
  partIndex: number;
};

export type AssistantActivityMessagePart = AssistantPartWithIndex & {
  message: UIMessage;
  messageIndex: number;
};

export type AssistantRenderBlock =
  | {
      type: "activityGroup";
      items: AssistantPartWithIndex[];
      hasFollowingText: boolean;
    }
  | {
      type: "text";
      item: AssistantPartWithIndex & {
        part: Extract<UIMessage["parts"][number], { type: "text" }>;
      };
    };

export type AssistantActivityMessageBlock =
  | {
      type: "message";
      message: UIMessage;
      messageIndex: number;
    }
  | {
      type: "activityRun";
      items: AssistantActivityMessagePart[];
      firstMessageIndex: number;
      lastMessageIndex: number;
      hasFollowingText: boolean;
    };

/** True when a message part renders inside the compact activity group. */
export function isAssistantActivityPart(part: UIMessage["parts"][number]): boolean {
  if (isToolUIPart(part)) return true;
  return part.type === "reasoning" && "text" in part && Boolean(part.text);
}

/** True when a part is assistant text that should render as final content. */
function isRenderableAssistantText(
  part: UIMessage["parts"][number] | undefined
): part is Extract<UIMessage["parts"][number], { type: "text" }> {
  if (!part) return false;
  return part.type === "text" && "text" in part && Boolean(part.text);
}

/** True when a part can be shown inside the compact work transcript. */
function isRenderableAssistantWorkPart(part: UIMessage["parts"][number]): boolean {
  return isAssistantActivityPart(part) || isRenderableAssistantText(part);
}

/** True when an assistant message contains activity and no renderable text. */
export function isAssistantActivityOnlyMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;

  let hasActivity = false;
  for (const part of message.parts) {
    if (isAssistantActivityPart(part)) {
      hasActivity = true;
      continue;
    }
    if (isRenderableAssistantText(part)) return false;
  }

  return hasActivity;
}

/** Check whether later assistant messages in this turn include final text. */
function hasFollowingAssistantText(messages: UIMessage[], startIndex: number): boolean {
  for (let index = startIndex; index < messages.length; index++) {
    const message = messages[index];
    if (!message) continue;
    if (message.role === "user") return false;
    if (message.role === "assistant" && message.parts.some(isRenderableAssistantText)) {
      return true;
    }
  }

  return false;
}

/** Return the last assistant text part in a contiguous assistant message run. */
function findFinalAssistantTextPart(
  messages: UIMessage[],
  startIndex: number,
  endIndex: number
): { messageIndex: number; partIndex: number } | null {
  for (let messageIndex = endIndex - 1; messageIndex >= startIndex; messageIndex--) {
    const message = messages[messageIndex];
    if (!message || message.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex--) {
      if (isRenderableAssistantText(message.parts[partIndex])) {
        return { messageIndex, partIndex };
      }
    }
  }

  return null;
}

/** True when a contiguous assistant message run contains tool or reasoning work. */
function assistantRunHasActivity(
  messages: UIMessage[],
  startIndex: number,
  endIndex: number
): boolean {
  for (let messageIndex = startIndex; messageIndex < endIndex; messageIndex++) {
    const message = messages[messageIndex];
    if (message?.role === "assistant" && message.parts.some(isAssistantActivityPart)) {
      return true;
    }
  }

  return false;
}

/** Collect visible work parts before the final assistant text in a message run. */
function collectAssistantRunWorkItems(
  messages: UIMessage[],
  startIndex: number,
  endIndex: number,
  finalTextPart: { messageIndex: number; partIndex: number } | null
): AssistantActivityMessagePart[] {
  const items: AssistantActivityMessagePart[] = [];

  for (let messageIndex = startIndex; messageIndex < endIndex; messageIndex++) {
    const message = messages[messageIndex];
    if (!message || message.role !== "assistant") continue;
    for (let partIndex = 0; partIndex < message.parts.length; partIndex++) {
      if (
        finalTextPart &&
        (messageIndex > finalTextPart.messageIndex ||
          (messageIndex === finalTextPart.messageIndex && partIndex >= finalTextPart.partIndex))
      ) {
        break;
      }

      const part = message.parts[partIndex];
      if (!isRenderableAssistantWorkPart(part)) continue;
      items.push({ part, partIndex, message, messageIndex });
    }
  }

  return items;
}

/**
 * Build message-level rows, optionally merging assistant work that appears
 * before the final assistant response in the same turn.
 */
export function buildAssistantActivityMessageBlocks(
  messages: UIMessage[],
  options?: { groupConsecutiveActivityOnlyMessages?: boolean }
): AssistantActivityMessageBlock[] {
  if (!options?.groupConsecutiveActivityOnlyMessages) {
    return messages.map((message, messageIndex) => ({
      type: "message",
      message,
      messageIndex,
    }));
  }

  const blocks: AssistantActivityMessageBlock[] = [];
  let messageIndex = 0;

  while (messageIndex < messages.length) {
    const message = messages[messageIndex];
    if (message?.role !== "assistant") {
      if (message) blocks.push({ type: "message", message, messageIndex });
      messageIndex++;
      continue;
    }

    const runStartIndex = messageIndex;
    let runEndIndex = messageIndex + 1;
    while (runEndIndex < messages.length && messages[runEndIndex]?.role === "assistant") {
      runEndIndex++;
    }

    if (!assistantRunHasActivity(messages, runStartIndex, runEndIndex)) {
      for (let index = runStartIndex; index < runEndIndex; index++) {
        blocks.push({ type: "message", message: messages[index], messageIndex: index });
      }
      messageIndex = runEndIndex;
      continue;
    }

    const finalTextPart = findFinalAssistantTextPart(messages, runStartIndex, runEndIndex);
    const workEndIndex = finalTextPart?.messageIndex ?? runEndIndex - 1;
    const crossMessageFinalTextPart = finalTextPart
      ? { messageIndex: finalTextPart.messageIndex, partIndex: 0 }
      : null;
    const workItems = collectAssistantRunWorkItems(
      messages,
      runStartIndex,
      runEndIndex,
      crossMessageFinalTextPart
    );

    if (workItems.length > 0) {
      blocks.push({
        type: "activityRun",
        items: workItems,
        firstMessageIndex: workItems[0].messageIndex,
        lastMessageIndex: workItems.at(-1)?.messageIndex ?? workEndIndex,
        hasFollowingText:
          Boolean(finalTextPart) || hasFollowingAssistantText(messages, workEndIndex + 1),
      });
    }

    const passthroughStartIndex = finalTextPart?.messageIndex ?? runEndIndex;
    for (let index = passthroughStartIndex; index < runEndIndex; index++) {
      blocks.push({ type: "message", message: messages[index], messageIndex: index });
    }

    messageIndex = runEndIndex;
  }

  return blocks;
}

/** Build render blocks that group contiguous reasoning/tool activity. */
export function buildAssistantRenderBlocks(parts: UIMessage["parts"]): AssistantRenderBlock[] {
  const blocks: AssistantRenderBlock[] = [];
  const finalTextIndex = (() => {
    for (let index = parts.length - 1; index >= 0; index--) {
      if (isRenderableAssistantText(parts[index])) return index;
    }
    return -1;
  })();

  const hasActivityBeforeFinal =
    finalTextIndex > 0 && parts.slice(0, finalTextIndex).some(isAssistantActivityPart);

  if (hasActivityBeforeFinal) {
    const activityItems = parts
      .slice(0, finalTextIndex)
      .map((part, partIndex) => ({ part, partIndex }))
      .filter((item) => isRenderableAssistantWorkPart(item.part));

    if (activityItems.length > 0) {
      blocks.push({
        type: "activityGroup",
        items: activityItems,
        hasFollowingText: true,
      });
    }

    const finalPart = parts[finalTextIndex];
    if (isRenderableAssistantText(finalPart)) {
      blocks.push({
        type: "text",
        item: { part: finalPart, partIndex: finalTextIndex },
      });
    }

    return blocks;
  }

  let pendingActivity: AssistantPartWithIndex[] = [];

  /** Flush pending activity parts into the block list at a text/trailing boundary. */
  const flushActivity = (hasFollowingText: boolean) => {
    if (pendingActivity.length === 0) return;
    blocks.push({
      type: "activityGroup",
      items: pendingActivity,
      hasFollowingText,
    });
    pendingActivity = [];
  };

  parts.forEach((part, partIndex) => {
    if (isAssistantActivityPart(part)) {
      pendingActivity.push({ part, partIndex });
      return;
    }

    if (part.type === "text" && "text" in part && part.text) {
      flushActivity(true);
      blocks.push({
        type: "text",
        item: { part, partIndex },
      });
    }
  });

  flushActivity(false);

  return blocks;
}

export type ActivityGroupStatus = "running" | "approval" | "error" | "warning" | "complete";

/** True when a tool UI part has a terminal result state. */
export function isTerminalToolState(state: string): boolean {
  return state === "output-available" || state === "output-error" || state === "output-denied";
}

/** Read a duration persisted on a terminal tool output, used after reloads. */
function getPersistedToolDurationMs(part: UIMessage["parts"][number]): number | undefined {
  if (!isToolUIPart(part)) return undefined;
  const output = "output" in part ? part.output : undefined;
  if (typeof output !== "object" || output === null || Array.isArray(output)) return undefined;
  const durationMs = (output as { durationMs?: unknown }).durationMs;
  return typeof durationMs === "number" && Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : undefined;
}

/**
 * Stamp `endedAt` on completed tools that never received a terminal timing update.
 * Returns the original map when nothing changed.
 */
export function finalizeCompletedToolTimings(
  messages: UIMessage[],
  timings: Map<string, ToolTiming>,
  endedAt: number = Date.now()
): Map<string, ToolTiming> {
  let changed = false;
  const next = new Map(timings);

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (!isToolUIPart(part)) continue;
      if (!isTerminalToolState(String(part.state))) continue;

      const current = next.get(part.toolCallId);
      if (current?.endedAt) continue;

      changed = true;
      next.set(part.toolCallId, {
        startedAt: current?.startedAt ?? endedAt,
        endedAt,
      });
    }
  }

  return changed ? next : timings;
}

/** Compute elapsed time for a group from the earliest tool start to latest tool end. */
export function getActivityDurationMs(
  items: AssistantPartWithIndex[],
  toolTimings: Map<string, ToolTiming> | undefined,
  options?: { isActivityComplete?: boolean }
): number | undefined {
  let startedAt: number | undefined;
  let endedAt: number | undefined;
  let persistedDurationMs: number | undefined;

  for (const item of items) {
    if (!isToolUIPart(item.part)) continue;
    const timing = toolTimings?.get(item.part.toolCallId);
    if (!timing?.startedAt) {
      const partDurationMs = getPersistedToolDurationMs(item.part);
      if (
        partDurationMs !== undefined &&
        options?.isActivityComplete &&
        isTerminalToolState(String(item.part.state))
      ) {
        persistedDurationMs =
          persistedDurationMs === undefined
            ? partDurationMs
            : Math.max(persistedDurationMs, partDurationMs);
      }
      continue;
    }

    const resolvedEnd =
      timing.endedAt ??
      (options?.isActivityComplete && isTerminalToolState(String(item.part.state))
        ? timing.startedAt
        : undefined);
    if (resolvedEnd === undefined) continue;

    startedAt =
      startedAt === undefined ? timing.startedAt : Math.min(startedAt, timing.startedAt);
    endedAt = endedAt === undefined ? resolvedEnd : Math.max(endedAt, resolvedEnd);
  }

  const liveDurationMs =
    startedAt === undefined || endedAt === undefined
      ? undefined
      : Math.max(0, endedAt - startedAt);
  if (liveDurationMs === undefined) return persistedDurationMs;
  if (persistedDurationMs === undefined) return liveDurationMs;
  return Math.max(liveDurationMs, persistedDurationMs);
}

/**
 * True while a compact activity row should show the active "Working..." label.
 * Following assistant text marks completion; otherwise the turn must still be active
 * or tools inside the group must still be running or awaiting approval.
 */
export function isActivityGroupWaitingForFinalResponse(options: {
  hasFollowingText: boolean;
  isLastMessage: boolean;
  activityStatus: ActivityGroupStatus;
  isTurnActive: boolean;
}): boolean {
  const { hasFollowingText, isLastMessage, activityStatus, isTurnActive } = options;
  if (hasFollowingText || !isLastMessage) return false;
  if (activityStatus === "running" || activityStatus === "approval") return isTurnActive;
  return isTurnActive;
}

/** Completed activity with final text can collapse; active/pending activity stays expanded. */
export function shouldAutoCollapseActivityGroup(
  hasFollowingText: boolean,
  hasPendingApproval: boolean
): boolean {
  return hasFollowingText && !hasPendingApproval;
}

/** Activity should only force details open when user action is needed. */
export function shouldForceExpandActivityGroup(hasPendingApproval: boolean): boolean {
  return hasPendingApproval;
}
