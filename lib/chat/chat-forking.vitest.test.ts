import { describe, expect, it } from "vitest";

import { createChatFork } from "@/lib/chat/chat-forking";
import type { Chat } from "@/lib/chat/chat-types";

const now = new Date("2026-07-07T12:00:00.000Z");

/** Builds a chat with enough history to exercise fork boundaries. */
function createSourceChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: "source-chat",
    title: "Revenue model",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "start" }],
        timestamp: now,
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-delegate",
            toolCallId: "tool-1",
            state: "output-available",
            input: {},
            output: "done",
          },
        ],
        timestamp: now,
      },
      {
        id: "user-2",
        role: "user",
        parts: [{ type: "text", text: "change this" }],
        timestamp: now,
        checkpointId: "request-2",
      },
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "tool-delegate",
            toolCallId: "tool-2",
            state: "output-available",
            input: {},
            output: "done",
          },
        ],
        timestamp: now,
      },
    ],
    subagentSessions: {
      "tool-1": {
        subagentType: "analysis",
        label: "Analysis",
        description: "First run",
        status: "completed",
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
      "tool-2": {
        subagentType: "analysis",
        label: "Analysis",
        description: "Second run",
        status: "completed",
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    compactionSummary: {
      text: "Earlier summary",
      coversThrough: "assistant-1",
      createdAt: now,
      model: "test-model",
      tokensSaved: 100,
    },
    ...overrides,
  };
}

describe("createChatFork", () => {
  it("excludes the edited user message for edit-resend forks", () => {
    const fork = createChatFork({
      sourceChat: createSourceChat(),
      sourceMessageIndex: 2,
      kind: "edit-resend",
      forkId: "fork-1",
      now,
    });

    expect(fork.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(fork.forkedFrom).toMatchObject({
      sourceChatId: "source-chat",
      sourceMessageId: "user-2",
      sourceMessageIndex: 2,
      mode: "edit_resend",
    });
  });

  it("includes the selected user message for explicit forks", () => {
    const fork = createChatFork({
      sourceChat: createSourceChat(),
      sourceMessageIndex: 2,
      kind: "fork-from-message",
      forkId: "fork-1",
      now,
    });

    expect(fork.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
    ]);
    expect(fork.forkedFrom?.mode).toBe("fork_from_message");
  });

  it("filters subagent sessions to copied tool calls", () => {
    const fork = createChatFork({
      sourceChat: createSourceChat(),
      sourceMessageIndex: 2,
      kind: "fork-from-message",
      forkId: "fork-1",
      now,
    });

    expect(Object.keys(fork.subagentSessions ?? {})).toEqual(["tool-1"]);
  });

  it("keeps compaction summaries only when the covered message remains copied", () => {
    const kept = createChatFork({
      sourceChat: createSourceChat(),
      sourceMessageIndex: 2,
      kind: "edit-resend",
      forkId: "fork-1",
      now,
    });
    const cleared = createChatFork({
      sourceChat: createSourceChat({
        compactionSummary: {
          text: "Later summary",
          coversThrough: "assistant-2",
          createdAt: now,
          model: "test-model",
          tokensSaved: 200,
        },
      }),
      sourceMessageIndex: 2,
      kind: "edit-resend",
      forkId: "fork-2",
      now,
    });

    expect(kept.compactionSummary?.text).toBe("Earlier summary");
    expect(cleared.compactionSummary).toBeUndefined();
  });
});
