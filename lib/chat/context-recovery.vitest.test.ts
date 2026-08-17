import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

import { CONTEXT_USAGE_VERSION, type ContextMeasurement } from "@/lib/agent/context-usage";
import type { CompactionSummary } from "@/lib/chat/chat-storage";
import { canStartContextRecovery, runContextRecoveryAttempt } from "./context-recovery";

function preflight(tokens: number, status: "ok" | "compact" | "over"): ContextMeasurement {
  return {
    version: CONTEXT_USAGE_VERSION,
    kind: "estimate",
    rawInputTokens: tokens,
    inputTokens: tokens,
    buckets: { system: 0, messages: tokens, tools: 0, images: 0, framing: 0 },
    calibrationDelta: 0,
    confidence: "low",
    calibrationSampleCount: 0,
    estimatorVersion: 2,
    window: {
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
    status,
    percentUsed: tokens / 96_000,
    measuredAt: "2026-08-14T00:00:00.000Z",
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
      .fn<(messages: UIMessage[]) => Promise<ContextMeasurement | null>>()
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

  it("does not resend when compaction removed the turn being retried", async () => {
    const resend = vi.fn();
    const messages: UIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "rework the chart" }] },
    ];
    const summary: CompactionSummary = {
      text: "The chart was reworked.",
      coversThrough: "user-1",
      createdAt: new Date(0),
      model: "test-model",
      tokensSaved: 0,
    };

    await expect(
      runContextRecoveryAttempt({
        messages,
        preflight: vi
          .fn<(messages: UIMessage[]) => Promise<ContextMeasurement | null>>()
          .mockResolvedValueOnce(preflight(100_000, "over"))
          .mockResolvedValueOnce(preflight(5_000, "ok")),
        compact: async () => summary,
        persistSummary: async () => undefined,
        applySummary: () => undefined,
        restoreMessages: () => undefined,
        // Only the synthetic compaction turns survive — nothing to act on.
        buildPayload: () =>
          [
            { id: "compaction-u-0", role: "user", parts: [{ type: "text", text: "Prior…" }] },
            { id: "compaction-a-0", role: "assistant", parts: [{ type: "text", text: "Got it." }] },
          ] as UIMessage[],
        resend,
      })
    ).rejects.toThrow("nothing left to resend");
    expect(resend).not.toHaveBeenCalled();
  });

  it("resends when the compacted payload still carries a real user turn", async () => {
    const resend = vi.fn();
    const messages: UIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "rework the chart" }] },
    ];
    const summary: CompactionSummary = {
      text: "Tool loop so far.",
      coversThrough: "user-1",
      createdAt: new Date(0),
      model: "test-model",
      tokensSaved: 0,
      resumeFromMessageId: "user-1",
    };

    await runContextRecoveryAttempt({
      messages,
      preflight: vi
        .fn<(messages: UIMessage[]) => Promise<ContextMeasurement | null>>()
        .mockResolvedValueOnce(preflight(100_000, "over"))
        .mockResolvedValueOnce(preflight(5_000, "ok")),
      compact: async () => summary,
      persistSummary: async () => undefined,
      applySummary: () => undefined,
      restoreMessages: () => undefined,
      buildPayload: () =>
        [
          { id: "compaction-u-0", role: "user", parts: [{ type: "text", text: "Prior…" }] },
          { id: "compaction-a-0", role: "assistant", parts: [{ type: "text", text: "Got it." }] },
          ...messages,
        ] as UIMessage[],
      resend,
    });

    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("does not resend when context measurement is unavailable", async () => {
    const resend = vi.fn();
    const messages: UIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "continue" }] },
    ];

    await expect(
      runContextRecoveryAttempt({
        messages,
        preflight: async () => null,
        compact: async () => ({
          text: "Summary",
          coversThrough: "user-1",
          createdAt: new Date(0),
          model: "test-model",
          tokensSaved: 0,
        }),
        persistSummary: async () => undefined,
        applySummary: () => undefined,
        restoreMessages: () => undefined,
        resend,
      })
    ).rejects.toThrow("Context measurement is unavailable");
    expect(resend).not.toHaveBeenCalled();
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
          .fn<(messages: UIMessage[]) => Promise<ContextMeasurement | null>>()
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
