import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  buildUserMessageClipboardPayload,
  formatClipboardPayloadComposerText,
  formatSlashCommandClipboardToken,
  formatUserMessageClipboardText,
  formatUserMessageClipboardHtml,
  parseUserMessageClipboardHtml,
} from "@/lib/chat/chat-message-copy";
import type { ResolvedChatReference } from "@/lib/chat/chat-references";

const cellReference: ResolvedChatReference = {
  id: "cell:test",
  type: "cell",
  label: "Cell #2",
  locator: {
    type: "cell",
    notebookPath: "/workspace/analysis.ipynb",
    cellIndices: [2],
  },
  status: "resolved",
  preview: "x = 1",
  resolvedAt: "2026-05-27T00:00:00.000Z",
};

describe("formatUserMessageClipboardText", () => {
  it("returns the original text when the message has no copyable chips", () => {
    const message: UIMessage = {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "  Keep spacing.  " }],
    };

    expect(formatUserMessageClipboardText(message)).toBe("  Keep spacing.  ");
  });

  it("prefixes message text with slash command and reference tokens", () => {
    const message: UIMessage = {
      id: "m2",
      role: "user",
      parts: [{ type: "text", text: "Analyze this cell." }],
      metadata: {
        slashCommands: [{ label: "/deep-eda", name: "skill:deep-eda", category: "skill" }],
        references: [cellReference],
      },
    };

    expect(formatUserMessageClipboardText(message)).toBe(
      "/deep-eda @Cell #2\nAnalyze this cell."
    );
  });

  it("copies chips even when the message body is empty", () => {
    const message: UIMessage = {
      id: "m3",
      role: "user",
      parts: [{ type: "text", text: "   " }],
      metadata: { references: [cellReference] },
    };

    expect(formatUserMessageClipboardText(message)).toBe("@Cell #2");
  });
});

describe("formatSlashCommandClipboardToken", () => {
  it("adds a leading slash when persisted metadata omits it", () => {
    expect(formatSlashCommandClipboardToken({ label: "agent" })).toBe("/agent");
  });
});

describe("Orion message clipboard payloads", () => {
  it("round-trips references through HTML clipboard metadata", () => {
    const message: UIMessage = {
      id: "m4",
      role: "user",
      parts: [{ type: "text", text: "Please inspect this." }],
      metadata: { references: [cellReference] },
    };

    const parsed = parseUserMessageClipboardHtml(formatUserMessageClipboardHtml(message));

    expect(parsed).toEqual(buildUserMessageClipboardPayload(message));
    expect(parsed?.metadata?.references).toEqual([cellReference]);
  });

  it("excludes reference tokens from composer paste text", () => {
    const payload = {
      version: 1 as const,
      text: "Please inspect this.",
      metadata: {
        slashCommands: [{ label: "/deep-eda", name: "skill:deep-eda", category: "skill" as const }],
        references: [cellReference],
      },
    };

    expect(formatClipboardPayloadComposerText(payload)).toBe("/deep-eda Please inspect this.");
  });
});
