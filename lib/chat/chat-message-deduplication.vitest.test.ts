import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { deduplicateMessagesById } from "./chat-message-deduplication";

/** Create a compact assistant-message fixture with a predictable part count. */
function assistantMessage(id: string, texts: string[]): UIMessage {
  return {
    id,
    role: "assistant",
    parts: texts.map((text) => ({ type: "text" as const, text })),
  };
}

describe("deduplicateMessagesById", () => {
  it("keeps unique transcripts unchanged", () => {
    const messages = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "hello" }] },
      assistantMessage("assistant-1", ["hi"]),
    ] as UIMessage[];

    expect(deduplicateMessagesById(messages)).toEqual({
      messages,
      changed: false,
    });
  });

  it("collapses interleaved snapshots into one message per id", () => {
    const firstAssistant = assistantMessage("assistant-1", ["step 1"]);
    const secondAssistant = assistantMessage("assistant-2", ["monthly"]);
    const completeFirstAssistant = assistantMessage("assistant-1", ["step 1", "step 2"]);

    const result = deduplicateMessagesById([
      { id: "user-1", role: "user", parts: [{ type: "text", text: "weekly" }] },
      firstAssistant,
      { id: "user-2", role: "user", parts: [{ type: "text", text: "monthly" }] },
      completeFirstAssistant,
      secondAssistant,
      firstAssistant,
      secondAssistant,
    ] as UIMessage[]);

    expect(result.changed).toBe(true);
    expect(result.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2",
    ]);
    expect(result.messages[1]).toBe(completeFirstAssistant);
  });

  it("keeps the later snapshot when part counts match", () => {
    const pending = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-bash",
          toolCallId: "call-1",
          state: "input-available",
          input: { command: "pwd" },
        },
      ],
    } as unknown as UIMessage;
    const completed = {
      ...pending,
      parts: [
        {
          type: "tool-bash",
          toolCallId: "call-1",
          state: "output-available",
          input: { command: "pwd" },
          output: "/workspace",
        },
      ],
    } as unknown as UIMessage;

    const result = deduplicateMessagesById([pending, completed]);

    expect(result.messages).toEqual([completed]);
  });
});
