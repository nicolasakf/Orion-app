import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { shouldContinueAfterToolCalls } from "./assistant-turn-state";

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
