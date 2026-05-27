import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  buildAssistantRenderBlocks,
  finalizeCompletedToolTimings,
  getActivityDurationMs,
  isActivityGroupWaitingForFinalResponse,
  shouldAutoCollapseActivityGroup,
  shouldForceExpandActivityGroup,
} from "./assistant-activity-grouping";

type Part = UIMessage["parts"][number];

/** Build a text part for render-block tests. */
function textPart(text: string): Extract<Part, { type: "text" }> {
  return { type: "text", text };
}

/** Build a reasoning part for render-block tests. */
function reasoningPart(text: string): Extract<Part, { type: "reasoning" }> {
  return { type: "reasoning", text };
}

/** Build a minimal tool part for render-block tests. */
function toolPart(toolName: string, toolCallId: string, state: string): Part {
  return {
    type: `tool-${toolName}`,
    toolCallId,
    state,
    input: {},
  } as Part;
}

describe("buildAssistantRenderBlocks", () => {
  it("keeps text-only assistant messages unchanged", () => {
    const blocks = buildAssistantRenderBlocks([textPart("hello")]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "text",
      item: { partIndex: 0, part: { text: "hello" } },
    });
  });

  it("groups reasoning and multiple tools before final text", () => {
    const blocks = buildAssistantRenderBlocks([
      reasoningPart("thinking"),
      toolPart("read_file", "call-1", "output-available"),
      toolPart("bash", "call-2", "output-available"),
      textPart("done"),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "activityGroup",
      hasFollowingText: true,
      items: [{ partIndex: 0 }, { partIndex: 1 }, { partIndex: 2 }],
    });
    expect(blocks[1]).toMatchObject({
      type: "text",
      item: { partIndex: 3 },
    });
  });

  it("creates separate activity groups around interleaved text", () => {
    const blocks = buildAssistantRenderBlocks([
      toolPart("read_file", "call-1", "output-available"),
      textPart("first"),
      toolPart("bash", "call-2", "output-available"),
      textPart("second"),
    ]);

    expect(blocks.map((block) => block.type)).toEqual([
      "activityGroup",
      "text",
      "activityGroup",
      "text",
    ]);
    expect(blocks[0]).toMatchObject({ type: "activityGroup", hasFollowingText: true });
    expect(blocks[2]).toMatchObject({ type: "activityGroup", hasFollowingText: true });
  });

  it("keeps pre-response activity out of final auto-collapse", () => {
    const blocks = buildAssistantRenderBlocks([
      textPart("before"),
      toolPart("bash", "call-1", "input-available"),
    ]);

    expect(blocks[1]).toMatchObject({
      type: "activityGroup",
      hasFollowingText: false,
      items: [{ partIndex: 1 }],
    });
    expect(shouldAutoCollapseActivityGroup(false, false)).toBe(false);
  });

  it("auto-collapses completed tools with following final text", () => {
    const blocks = buildAssistantRenderBlocks([
      toolPart("bash", "call-1", "output-available"),
      textPart("final"),
    ]);

    expect(blocks[0]).toMatchObject({
      type: "activityGroup",
      hasFollowingText: true,
    });
    expect(shouldAutoCollapseActivityGroup(true, false)).toBe(true);
  });

  it("only forces expansion for activity needing approval", () => {
    expect(shouldForceExpandActivityGroup(true)).toBe(true);
    expect(shouldForceExpandActivityGroup(false)).toBe(false);
  });
});

describe("isActivityGroupWaitingForFinalResponse", () => {
  it("stops waiting when the turn ends without following assistant text", () => {
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: true,
        activityStatus: "complete",
        isTurnActive: false,
      })
    ).toBe(false);
  });

  it("keeps waiting while the turn is still active on the last message", () => {
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: true,
        activityStatus: "complete",
        isTurnActive: true,
      })
    ).toBe(true);
  });

  it("keeps waiting while tools are still running or need approval", () => {
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: true,
        activityStatus: "running",
        isTurnActive: false,
      })
    ).toBe(true);
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: true,
        activityStatus: "approval",
        isTurnActive: false,
      })
    ).toBe(true);
  });

  it("treats historical activity without following text as completed", () => {
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: false,
        activityStatus: "complete",
        isTurnActive: true,
      })
    ).toBe(false);
  });

  it("treats following assistant text as completion", () => {
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: true,
        isLastMessage: true,
        activityStatus: "running",
        isTurnActive: true,
      })
    ).toBe(false);
  });
});

describe("finalizeCompletedToolTimings", () => {
  it("stamps endedAt on terminal tools missing a terminal timing", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant" as const,
        parts: [toolPart("bash", "call-1", "output-available")],
      },
    ] satisfies UIMessage[];

    const next = finalizeCompletedToolTimings(
      messages,
      new Map([["call-1", { startedAt: 100 }]]),
      5_500
    );

    expect(next.get("call-1")).toEqual({ startedAt: 100, endedAt: 5_500 });
  });

  it("creates timing entries for completed tools that were never tracked", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant" as const,
        parts: [toolPart("read_file", "call-2", "output-available")],
      },
    ] satisfies UIMessage[];

    const next = finalizeCompletedToolTimings(messages, new Map(), 2_000);

    expect(next.get("call-2")).toEqual({ startedAt: 2_000, endedAt: 2_000 });
  });
});

describe("getActivityDurationMs", () => {
  const items = [{ part: toolPart("bash", "call-1", "output-available"), partIndex: 0 }];

  it("returns elapsed time when start and end timestamps exist", () => {
    const duration = getActivityDurationMs(
      items,
      new Map([["call-1", { startedAt: 1_000, endedAt: 6_000 }]])
    );

    expect(duration).toBe(5_000);
  });

  it("uses terminal tool state as a fallback end when activity is complete", () => {
    const duration = getActivityDurationMs(
      items,
      new Map([["call-1", { startedAt: 1_000 }]]),
      { isActivityComplete: true }
    );

    expect(duration).toBe(0);
  });

  it("returns undefined while activity is still in progress without endedAt", () => {
    const duration = getActivityDurationMs(
      items,
      new Map([["call-1", { startedAt: 1_000 }]]),
      { isActivityComplete: false }
    );

    expect(duration).toBeUndefined();
  });
});
