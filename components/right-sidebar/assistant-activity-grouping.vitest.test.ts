import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  buildAssistantActivityMessageBlocks,
  buildAssistantRenderBlocks,
  attachPersistedToolTimings,
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

  it("keeps pre-final text inside one activity group", () => {
    const blocks = buildAssistantRenderBlocks([
      toolPart("read_file", "call-1", "output-available"),
      textPart("first"),
      toolPart("bash", "call-2", "output-available"),
      textPart("second"),
    ]);

    expect(blocks.map((block) => block.type)).toEqual(["activityGroup", "text"]);
    expect(blocks[0]).toMatchObject({ type: "activityGroup", hasFollowingText: true });
    expect(blocks[0]).toMatchObject({
      type: "activityGroup",
      items: [{ partIndex: 0 }, { partIndex: 1 }, { partIndex: 2 }],
    });
    expect(blocks[1]).toMatchObject({
      type: "text",
      item: { partIndex: 3 },
    });
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

describe("buildAssistantActivityMessageBlocks", () => {
  it("groups consecutive assistant activity-only messages before final text", () => {
    const messages = [
      {
        id: "user-1",
        role: "user" as const,
        parts: [textPart("go")],
      },
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [toolPart("use_notebook", "call-1", "output-available")],
      },
      {
        id: "assistant-2",
        role: "assistant" as const,
        parts: [toolPart("read_notebook", "call-2", "output-available")],
      },
      {
        id: "assistant-3",
        role: "assistant" as const,
        parts: [textPart("done")],
      },
    ] satisfies UIMessage[];

    const blocks = buildAssistantActivityMessageBlocks(messages, {
      groupConsecutiveActivityOnlyMessages: true,
    });

    expect(blocks.map((block) => block.type)).toEqual([
      "message",
      "activityRun",
      "message",
    ]);
    expect(blocks[1]).toMatchObject({
      type: "activityRun",
      firstMessageIndex: 1,
      lastMessageIndex: 2,
      hasFollowingText: true,
      items: [
        { messageIndex: 1, partIndex: 0, part: { toolCallId: "call-1" } },
        { messageIndex: 2, partIndex: 0, part: { toolCallId: "call-2" } },
      ],
    });
  });

  it("groups assistant progress text with earlier work before the final response", () => {
    const messages = [
      {
        id: "user-1",
        role: "user" as const,
        parts: [textPart("go")],
      },
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [toolPart("use_notebook", "call-1", "output-available")],
      },
      {
        id: "assistant-2",
        role: "assistant" as const,
        parts: [textPart("I checked the notebook. Running the next cell.")],
      },
      {
        id: "assistant-3",
        role: "assistant" as const,
        parts: [toolPart("execute_cell", "call-2", "output-available")],
      },
      {
        id: "assistant-4",
        role: "assistant" as const,
        parts: [textPart("done")],
      },
    ] satisfies UIMessage[];

    const blocks = buildAssistantActivityMessageBlocks(messages, {
      groupConsecutiveActivityOnlyMessages: true,
    });

    expect(blocks.map((block) => block.type)).toEqual([
      "message",
      "activityRun",
      "message",
    ]);
    expect(blocks[1]).toMatchObject({
      type: "activityRun",
      firstMessageIndex: 1,
      lastMessageIndex: 3,
      hasFollowingText: true,
      items: [
        { messageIndex: 1, partIndex: 0, part: { toolCallId: "call-1" } },
        {
          messageIndex: 2,
          partIndex: 0,
          part: { text: "I checked the notebook. Running the next cell." },
        },
        { messageIndex: 3, partIndex: 0, part: { toolCallId: "call-2" } },
      ],
    });
  });

  it("leaves assistant text-only runs unchanged", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [textPart("first chunk")],
      },
      {
        id: "assistant-2",
        role: "assistant" as const,
        parts: [textPart("second chunk")],
      },
    ] satisfies UIMessage[];

    const blocks = buildAssistantActivityMessageBlocks(messages, {
      groupConsecutiveActivityOnlyMessages: true,
    });

    expect(blocks).toMatchObject([
      { type: "message", messageIndex: 0 },
      { type: "message", messageIndex: 1 },
    ]);
  });

  it("does not treat assistant text after a user boundary as final text for an activity run", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [toolPart("bash", "call-1", "output-available")],
      },
      {
        id: "user-1",
        role: "user" as const,
        parts: [textPart("next")],
      },
      {
        id: "assistant-2",
        role: "assistant" as const,
        parts: [textPart("answer")],
      },
    ] satisfies UIMessage[];

    const blocks = buildAssistantActivityMessageBlocks(messages, {
      groupConsecutiveActivityOnlyMessages: true,
    });

    expect(blocks[0]).toMatchObject({
      type: "activityRun",
      hasFollowingText: false,
    });
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

  it("keeps waiting while tools are still running or need approval in an active turn", () => {
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: true,
        activityStatus: "running",
        isTurnActive: true,
      })
    ).toBe(true);
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: true,
        activityStatus: "approval",
        isTurnActive: true,
      })
    ).toBe(true);
  });

  it("stops waiting for stale pending tools after the turn is stopped", () => {
    expect(
      isActivityGroupWaitingForFinalResponse({
        hasFollowingText: false,
        isLastMessage: true,
        activityStatus: "running",
        isTurnActive: false,
      })
    ).toBe(false);
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

  it("uses persisted cancelled tool duration after reload", () => {
    const cancelledPart = {
      ...toolPart("bash", "call-3", "output-error"),
      output: { error: "cancelled_by_user", durationMs: 4_200 },
      errorText: "cancelled_by_user",
    } as unknown as Part;

    const duration = getActivityDurationMs(
      [{ part: cancelledPart, partIndex: 0 }],
      new Map(),
      { isActivityComplete: true }
    );

    expect(duration).toBe(4_200);
  });

  it("uses persisted tool timestamps after reload", () => {
    const persistedPart = {
      ...toolPart("bash", "call-4", "output-available"),
      output: { stdout: "done" },
      orionTiming: { startedAt: 1_000, endedAt: 8_000 },
    } as unknown as Part;

    const duration = getActivityDurationMs(
      [{ part: persistedPart, partIndex: 0 }],
      new Map(),
      { isActivityComplete: true }
    );

    expect(duration).toBe(7_000);
  });

  it("preserves the full tool span across a reloaded activity group", () => {
    const firstPart = {
      ...toolPart("read_file", "call-5", "output-available"),
      output: { text: "first" },
      orionTiming: { startedAt: 1_000, endedAt: 3_000 },
    } as unknown as Part;
    const secondPart = {
      ...toolPart("bash", "call-6", "output-available"),
      output: { stdout: "second" },
      orionTiming: { startedAt: 5_000, endedAt: 9_000 },
    } as unknown as Part;

    const duration = getActivityDurationMs(
      [
        { part: firstPart, partIndex: 0 },
        { part: secondPart, partIndex: 1 },
      ],
      new Map(),
      { isActivityComplete: true }
    );

    expect(duration).toBe(8_000);
  });

  it("adds completed tool timestamps to messages before persistence", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant" as const,
        parts: [
          {
            ...toolPart("bash", "call-7", "output-available"),
            output: { stdout: "done" },
          } as unknown as Part,
        ],
      },
    ] satisfies UIMessage[];

    const persisted = attachPersistedToolTimings(
      messages,
      new Map([["call-7", { startedAt: 2_000, endedAt: 6_500 }]])
    );

    expect(persisted[0]?.parts[0]).toMatchObject({
      orionTiming: { startedAt: 2_000, endedAt: 6_500 },
    });
  });
});
