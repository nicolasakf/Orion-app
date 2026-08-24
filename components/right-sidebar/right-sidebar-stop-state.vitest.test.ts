import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  getCompletedToolContinuationKey,
  getTranscriptProgressCount,
  shouldContinueAfterToolCalls,
} from "./assistant-turn-state";

const APPROVED_PROPOSAL_PART = {
  type: "tool-propose_goal_contract",
  toolCallId: "proposal-1",
  state: "output-available",
  input: {
    objective: "Analyze sales",
    deliverables: [{ path: "analysis.ipynb", description: "Analysis" }],
    acceptanceCriteria: [{ id: "strong", description: "Validated result" }],
    constraints: [],
  },
  output: { status: "approved", goalSessionId: "goal-1" },
};

describe("shouldContinueAfterToolCalls", () => {
  it("does not keep the turn active after a cancelled tool result reloads", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [
          {
            type: "tool-bash",
            toolCallId: "call-1",
            state: "output-error",
            input: { command: "sleep 30" },
            output: { error: "cancelled_by_user" },
            errorText: "cancelled_by_user",
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(shouldContinueAfterToolCalls(messages)).toBe(false);
  });

  it("does not automatically continue after a goal contract decision", () => {
    const messages = [
      {
        id: "assistant-contract",
        role: "assistant" as const,
        parts: [
          {
            type: "tool-propose_goal_contract",
            toolCallId: "proposal-1",
            state: "output-available",
            input: {
              objective: "Analyze sales",
              deliverables: [{ path: "analysis.ipynb", description: "Analysis" }],
              acceptanceCriteria: [{ id: "strong", description: "Validated result" }],
              constraints: [],
            },
            output: { status: "revision_requested" },
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(shouldContinueAfterToolCalls(messages)).toBe(false);
    expect(getCompletedToolContinuationKey(messages)).toBeNull();
  });

  it("keeps the goal worker running after an approved proposal in the same turn", () => {
    // The AI SDK appends the worker's steps to the assistant message that already
    // holds the proposal, so the loop must key off the trailing tool call.
    const messages = [
      {
        id: "assistant-contract",
        role: "assistant" as const,
        parts: [
          APPROVED_PROPOSAL_PART,
          {
            type: "tool-list_kernels",
            toolCallId: "call-kernels",
            state: "output-available",
            input: {},
            output: "python3\tidle",
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(shouldContinueAfterToolCalls(messages)).toBe(true);
    expect(getCompletedToolContinuationKey(messages)).toBe(
      "tool-list_kernels:call-kernels:output-available"
    );
  });

  it("still pauses when a proposal in the turn has no decision yet", () => {
    const messages = [
      {
        id: "assistant-contract",
        role: "assistant" as const,
        parts: [
          { ...APPROVED_PROPOSAL_PART, state: "input-available", output: undefined },
          {
            type: "tool-list_kernels",
            toolCallId: "call-kernels",
            state: "output-available",
            input: {},
            output: "python3\tidle",
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(shouldContinueAfterToolCalls(messages)).toBe(false);
    expect(getCompletedToolContinuationKey(messages)).toBeNull();
  });
});

describe("getTranscriptProgressCount", () => {
  it("advances when a worker step is appended to the existing assistant message", () => {
    const before = [
      {
        id: "assistant-contract",
        role: "assistant" as const,
        parts: [APPROVED_PROPOSAL_PART],
      },
    ] as unknown as UIMessage[];
    const after = [
      {
        id: "assistant-contract",
        role: "assistant" as const,
        parts: [
          APPROVED_PROPOSAL_PART,
          {
            type: "tool-list_kernels",
            toolCallId: "call-kernels",
            state: "output-available",
            input: {},
            output: "python3\tidle",
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(before.length).toBe(after.length);
    expect(getTranscriptProgressCount(after)).toBeGreaterThan(
      getTranscriptProgressCount(before)
    );
  });
});

describe("continuation keys", () => {
  it("returns a stable key for the completed tool result that can trigger auto-send", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [
          {
            type: "tool-execute_cell",
            toolCallId: "execute_cell_15",
            state: "output-available",
            input: { cellIndices: [1], timeoutSeconds: 60 },
            output: "schema output",
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(getCompletedToolContinuationKey(messages)).toBe(
      "tool-execute_cell:execute_cell_15:output-available"
    );
  });

});
