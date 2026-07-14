import { describe, expect, it } from "vitest";

import {
  createChatFork,
  truncateChatForInPlaceEdit,
} from "@/lib/chat/chat-forking";
import type { Chat } from "@/lib/chat/chat-types";

const now = new Date("2026-07-07T12:00:00.000Z");
const editedAt = new Date("2026-07-07T12:01:00.000Z");

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
  it("includes history through the selected assistant message", () => {
    const fork = createChatFork({
      sourceChat: createSourceChat(),
      sourceMessageIndex: 1,
      forkId: "fork-1",
      now,
    });

    expect(fork.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(fork.forkedFrom).toMatchObject({
      sourceChatId: "source-chat",
      sourceMessageId: "assistant-1",
      sourceMessageIndex: 1,
      mode: "fork_from_message",
    });
  });

  it("rejects non-assistant fork boundaries", () => {
    expect(() =>
      createChatFork({
        sourceChat: createSourceChat(),
        sourceMessageIndex: 2,
        forkId: "fork-1",
        now,
      })
    ).toThrow("source message must be an assistant message");
  });

  it("filters subagent sessions to copied tool calls", () => {
    const fork = createChatFork({
      sourceChat: createSourceChat(),
      sourceMessageIndex: 1,
      forkId: "fork-1",
      now,
    });

    expect(Object.keys(fork.subagentSessions ?? {})).toEqual(["tool-1"]);
  });

  it("keeps compaction summaries only when the covered message remains copied", () => {
    const kept = createChatFork({
      sourceChat: createSourceChat(),
      sourceMessageIndex: 1,
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
      sourceMessageIndex: 1,
      forkId: "fork-2",
      now,
    });

    expect(kept.compactionSummary?.text).toBe("Earlier summary");
    expect(cleared.compactionSummary).toBeUndefined();
  });
});

describe("truncateChatForInPlaceEdit", () => {
  it("retains the edited user message in the current chat while removing its tail state", () => {
    const sourceChat = createSourceChat({
      forkedFrom: {
        sourceChatId: "older-chat",
        sourceMessageId: "assistant-0",
        sourceMessageIndex: 1,
        mode: "fork_from_message",
        createdAt: now,
      },
    });

    const truncated = truncateChatForInPlaceEdit({
      sourceChat,
      sourceMessageIndex: 2,
      now: editedAt,
    });

    expect(truncated).not.toBe(sourceChat);
    expect(truncated.id).toBe(sourceChat.id);
    expect(truncated.title).toBe(sourceChat.title);
    expect(truncated.createdAt).toBe(sourceChat.createdAt);
    expect(truncated.updatedAt).toBe(editedAt);
    expect(truncated.forkedFrom).toBe(sourceChat.forkedFrom);
    expect(truncated.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
    ]);
    expect(truncated.messages[2]).not.toHaveProperty("checkpointId");
    expect(sourceChat.messages[2]?.checkpointId).toBe("request-2");
    expect(Object.keys(truncated.subagentSessions ?? {})).toEqual(["tool-1"]);
    expect(truncated.compactionSummary?.coversThrough).toBe("assistant-1");
  });

  it("invalidates compaction that covers the edited message or a removed tail message", () => {
    const atEditedMessage = truncateChatForInPlaceEdit({
      sourceChat: createSourceChat({
        compactionSummary: {
          text: "Edited message summary",
          coversThrough: "user-2",
          createdAt: now,
          model: "test-model",
          tokensSaved: 150,
        },
      }),
      sourceMessageIndex: 2,
      now: editedAt,
    });
    const atTailMessage = truncateChatForInPlaceEdit({
      sourceChat: createSourceChat({
        compactionSummary: {
          text: "Tail summary",
          coversThrough: "assistant-2",
          createdAt: now,
          model: "test-model",
          tokensSaved: 200,
        },
      }),
      sourceMessageIndex: 2,
      now: editedAt,
    });

    expect(atEditedMessage.compactionSummary).toBeUndefined();
    expect(atTailMessage.compactionSummary).toBeUndefined();
  });

  it("rejects missing and non-user edit boundaries", () => {
    expect(() =>
      truncateChatForInPlaceEdit({
        sourceChat: createSourceChat(),
        sourceMessageIndex: 1,
        now: editedAt,
      })
    ).toThrow("source message must be a user message");
    expect(() =>
      truncateChatForInPlaceEdit({
        sourceChat: createSourceChat(),
        sourceMessageIndex: 99,
        now: editedAt,
      })
    ).toThrow("source message does not exist");
  });
});
