import { isToolUIPart, type UIMessage } from "ai";

export interface ToolTiming {
  startedAt: number;
  endedAt?: number;
}

export type AssistantPartWithIndex = {
  part: UIMessage["parts"][number];
  partIndex: number;
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

/** True when a message part renders inside the compact activity group. */
export function isAssistantActivityPart(part: UIMessage["parts"][number]): boolean {
  if (isToolUIPart(part)) return true;
  return part.type === "reasoning" && "text" in part && Boolean(part.text);
}

/** Build render blocks that group contiguous reasoning/tool activity. */
export function buildAssistantRenderBlocks(parts: UIMessage["parts"]): AssistantRenderBlock[] {
  const blocks: AssistantRenderBlock[] = [];
  let pendingActivity: AssistantPartWithIndex[] = [];

  /** Check whether later parts contain assistant text that can finalize the activity. */
  const hasTextAfter = (startIndex: number): boolean =>
    parts
      .slice(startIndex)
      .some((part) => part.type === "text" && "text" in part && Boolean(part.text));

  /** Flush pending activity parts into the block list at a text/trailing boundary. */
  const flushActivity = (nextIndex: number) => {
    if (pendingActivity.length === 0) return;
    blocks.push({
      type: "activityGroup",
      items: pendingActivity,
      hasFollowingText: hasTextAfter(nextIndex),
    });
    pendingActivity = [];
  };

  parts.forEach((part, partIndex) => {
    if (isAssistantActivityPart(part)) {
      pendingActivity.push({ part, partIndex });
      return;
    }

    if (part.type === "text" && "text" in part && part.text) {
      flushActivity(partIndex);
      blocks.push({
        type: "text",
        item: { part, partIndex },
      });
    }
  });

  flushActivity(parts.length);

  return blocks;
}

export type ActivityGroupStatus = "running" | "approval" | "error" | "warning" | "complete";

/** True when a tool UI part has a terminal result state. */
export function isTerminalToolState(state: string): boolean {
  return state === "output-available" || state === "output-error" || state === "output-denied";
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

  for (const item of items) {
    if (!isToolUIPart(item.part)) continue;
    const timing = toolTimings?.get(item.part.toolCallId);
    if (!timing?.startedAt) continue;

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

  if (startedAt === undefined || endedAt === undefined) return undefined;
  return Math.max(0, endedAt - startedAt);
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
  if (activityStatus === "running" || activityStatus === "approval") return true;
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
