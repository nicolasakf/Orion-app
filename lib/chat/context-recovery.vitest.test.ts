import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

import type { ContextPreflightResult } from "@/lib/agent/context-preflight";
import type { CompactionSummary } from "@/lib/chat/chat-storage";
import { canStartContextRecovery, runContextRecoveryAttempt } from "./context-recovery";

function preflight(tokens: number, status: "ok" | "compact" | "over"): ContextPreflightResult {
  return {
    version: 1,
    model: {
      modelId: "test-model",
      providerId: "openai",
      contextWindow: 100_000,
      maxOutputTokens: 4_000,
      contextWindowSource: "test",
      contextWindowFetchedAt: null,
      contextWindowIsFallback: false,
    },
    budget: {
      outputReserve: 4_000,
      usableInputTokens: 96_000,
      thresholdTokens: 88_000,
      autoCompactThreshold: 0.92,
    },
    measurement: {
      rawInputTokens: tokens,
      estimatedInputTokens: tokens,
      confidence: "low",
      calibrationSampleCount: 0,
      percentUsed: tokens / 96_000,
      status,
      breakdown: { system: 0, messages: tokens, tools: 0, images: 0, framing: 0 },
    },
  };
}

describe("context recovery", () => {
  it("allows only the first overflow in a model turn to start recovery", () => {
    expect(
      canStartContextRecovery({
        isContextError: true,
        alreadyAttempted: false,
        compactionInFlight: false,
        hasChatId: true,
      })
    ).toBe(true);
    expect(
      canStartContextRecovery({
        isContextError: true,
        alreadyAttempted: true,
        compactionInFlight: false,
        hasChatId: true,
      })
    ).toBe(false);
  });

  it("persists, preflights, restores tool messages, and resends exactly once", async () => {
    const toolMessage = {
      id: "assistant-tool",
      role: "assistant",
      parts: [
        {
          type: "tool-read_file",
          toolCallId: "call-1",
          state: "output-available",
          input: { path: "/tmp/example" },
          output: { text: "completed result" },
        },
      ],
    } as UIMessage;
    const messages: UIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "read it" }] },
      toolMessage,
    ];
    const summary: CompactionSummary = {
      text: "The file was read.",
      coversThrough: "user-1",
      createdAt: new Date(),
      model: "test-model",
      tokensSaved: 0,
    };
    const persistSummary = vi.fn(async () => undefined);
    const applySummary = vi.fn();
    const restoreMessages = vi.fn();
    const resend = vi.fn();
    const preflightCall = vi
      .fn<(messages: UIMessage[]) => Promise<ContextPreflightResult | null>>()
      .mockResolvedValueOnce(preflight(100_000, "over"))
      .mockResolvedValueOnce(preflight(50_000, "ok"));

    await runContextRecoveryAttempt({
      messages,
      preflight: preflightCall,
      compact: async () => summary,
      persistSummary,
      applySummary,
      restoreMessages,
      resend,
    });

    expect(preflightCall).toHaveBeenCalledTimes(2);
    expect(persistSummary).toHaveBeenCalledTimes(2);
    expect(restoreMessages).toHaveBeenCalledWith(messages);
    expect(restoreMessages.mock.calls[0][0][1]).toBe(toolMessage);
    expect(resend).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledWith();
  });

  it("does not resend when the compacted request remains over budget", async () => {
    const resend = vi.fn();
    const messages: UIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "continue" }] },
    ];
    const summary: CompactionSummary = {
      text: "Summary",
      coversThrough: "user-1",
      createdAt: new Date(),
      model: "test-model",
      tokensSaved: 0,
    };

    await expect(
      runContextRecoveryAttempt({
        messages,
        preflight: vi
          .fn<(messages: UIMessage[]) => Promise<ContextPreflightResult | null>>()
          .mockResolvedValueOnce(preflight(100_000, "over"))
          .mockResolvedValueOnce(preflight(99_000, "over")),
        compact: async () => summary,
        persistSummary: async () => undefined,
        applySummary: () => undefined,
        restoreMessages: () => undefined,
        resend,
      })
    ).rejects.toThrow("remains over");
    expect(resend).not.toHaveBeenCalled();
  });
});
