import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

vi.mock("@/lib/chat/compaction-client", () => ({
  callCompactionApi: vi.fn(async (messages: UIMessage[]) => ({
    summaryText: messages
      .map((message) => message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""))
      .join(" | "),
    tokensUsed: 10,
    coversThrough: messages.at(-1)?.id ?? "",
  })),
}));

import { callCompactionApi } from "@/lib/chat/compaction-client";
import {
  compactConversation,
  prepareMessagesForCompaction,
} from "./context-manager";

/** Creates a text-only UI message for compaction tests. */
function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("prepareMessagesForCompaction", () => {
  it("strips files and bounds bulky tool payloads without mutating the source", () => {
    const messages = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-read_file",
            toolCallId: "tool-1",
            state: "output-available",
            input: { path: "/tmp/data.csv" },
            output: "x".repeat(20_000),
          },
          {
            type: "file",
            mediaType: "image/png",
            filename: "plot.png",
            url: `data:image/png;base64,${"a".repeat(20_000)}`,
          },
        ],
      },
    ] as unknown as UIMessage[];

    const prepared = prepareMessagesForCompaction(messages);
    const text = prepared[0].parts[0].type === "text" ? prepared[0].parts[0].text : "";

    expect(text).toContain("Tool read_file");
    expect(text).toContain("truncated from 20002 chars");
    expect(text).toContain("Attached file plot.png (image/png) omitted");
    expect(text).not.toContain("data:image/png");
    expect(messages[0].parts).toHaveLength(2);
  });
});

describe("compactConversation", () => {
  it("summarizes only messages not already covered by the previous summary", async () => {
    const messages = [
      textMessage("u1", "user", "first"),
      textMessage("a1", "assistant", "first answer"),
      textMessage("u2", "user", "second"),
      textMessage("a2", "assistant", "second answer"),
      textMessage("u3", "user", "third"),
      textMessage("a3", "assistant", "third answer"),
    ];

    const result = await compactConversation(messages, {
      chatId: "chat-1",
      previousSummary: {
        text: "existing summary",
        coversThrough: "a1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        model: "gpt-test",
        tokensSaved: 5,
      },
      retentionTurns: 1,
      model: "gpt-test",
      provider: "openai",
      contextSettings: {
        compactionAutoThreshold: 0.8,
        compactionRetentionTurns: 4,
        optimizerRetentionTurns: 6,
      },
    });

    expect(vi.mocked(callCompactionApi)).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "u2" }),
        expect.objectContaining({ id: "a2" }),
      ]),
      "existing summary",
      "gpt-test",
      "openai",
      "chat-1",
      // Forwarded so the server fits summary chunks against the user's own
      // threshold rather than silently falling back to the default.
      expect.objectContaining({ compactionAutoThreshold: 0.8 })
    );
    const sentMessages = vi.mocked(callCompactionApi).mock.calls.at(-1)?.[0] ?? [];
    expect(sentMessages.map((message) => message.id)).toEqual(["u2", "a2"]);
    expect(result.summary.coversThrough).toBe("a2");
  });

  it("records a resume id when the retention window swallows the live turn", async () => {
    vi.mocked(callCompactionApi).mockClear();
    // A single user turn plus its agent tool loop — nothing older to summarize.
    const messages = [
      textMessage("u1", "user", "remove the second chart"),
      textMessage("a1", "assistant", "reading the notebook"),
      textMessage("a2", "assistant", "rewriting cell 9"),
    ];

    const result = await compactConversation(messages, {
      chatId: "chat-1",
      retentionTurns: 1,
      model: "gpt-test",
      provider: "openai",
    });

    expect(result.summary.resumeFromMessageId).toBe("u1");
    expect(result.summary.coversThrough).toBe("a2");
  });

  it("leaves the resume id unset when older history covers the summary", async () => {
    vi.mocked(callCompactionApi).mockClear();
    const messages = [
      textMessage("u1", "user", "first"),
      textMessage("a1", "assistant", "first answer"),
      textMessage("u2", "user", "second"),
      textMessage("a2", "assistant", "second answer"),
    ];

    const result = await compactConversation(messages, {
      chatId: "chat-1",
      retentionTurns: 1,
      model: "gpt-test",
      provider: "openai",
    });

    expect(result.summary.resumeFromMessageId).toBeUndefined();
  });

  it("reuses the prior summary when no newly compactable history exists", async () => {
    vi.mocked(callCompactionApi).mockClear();
    const previousSummary = {
      text: "existing summary",
      coversThrough: "a1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      model: "gpt-test",
      tokensSaved: 5,
    };

    const result = await compactConversation(
      [textMessage("u1", "user", "first"), textMessage("a1", "assistant", "answer")],
      {
        chatId: "chat-1",
        previousSummary,
        retentionTurns: 1,
        model: "gpt-test",
        provider: "openai",
      }
    );

    expect(result.summary).toBe(previousSummary);
    expect(callCompactionApi).not.toHaveBeenCalled();
  });
});
