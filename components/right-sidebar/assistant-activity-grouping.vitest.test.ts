import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  buildAssistantRenderBlocks,
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
