import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  getCompletedToolContinuationKey,
  shouldContinueAfterToolCalls,
} from "./assistant-turn-state";

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
