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

/** Completed activity with final text can collapse; active/pending activity stays expanded. */
export function shouldAutoCollapseActivityGroup(
  hasFollowingText: boolean,
  hasPendingTool: boolean
): boolean {
  return hasFollowingText && !hasPendingTool;
}
