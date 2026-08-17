import { act, renderHook } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONTEXT_USAGE_VERSION, type ContextMeasurement } from "@/lib/agent/context-usage";

import { useContextUsage, type UseContextUsageOptions } from "./use-context-usage";

/** Builds a complete measurement whose buckets sum to `rawInputTokens`. */
function createMeasurement(overrides?: Partial<ContextMeasurement>): ContextMeasurement {
  const buckets = { system: 500, messages: 400, tools: 80, images: 0, framing: 20 };
  const rawInputTokens = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  return {
    version: CONTEXT_USAGE_VERSION,
    kind: "estimate",
    rawInputTokens,
    inputTokens: Math.ceil(rawInputTokens * 1.15),
    buckets,
    calibrationDelta: Math.ceil(rawInputTokens * 1.15) - rawInputTokens,
    confidence: "low",
    calibrationSampleCount: 0,
    estimatorVersion: 2,
    window: {
      providerId: "openai",
      modelId: "gpt-5",
      contextWindow: 200_000,
      maxOutputTokens: 16_000,
      contextWindowSource: "snapshot",
      contextWindowFetchedAt: null,
      contextWindowIsFallback: false,
    },
    budget: {
      outputReserve: 10_000,
      usableInputTokens: 190_000,
      thresholdTokens: 174_800,
      autoCompactThreshold: 0.92,
    },
    status: "ok",
    percentUsed: 0.006,
    measuredAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

const MESSAGES: UIMessage[] = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
] as UIMessage[];

function baseOptions(
  overrides?: Partial<UseContextUsageOptions>
): UseContextUsageOptions {
  return {
    messages: MESSAGES,
    draft: { text: "", imageAttachmentCount: 0, referenceBlockChars: 0 },
    modelKey: "openai/gpt-5",
    chatId: "chat-1",
    compactionEpoch: 0,
    isTurnActive: false,
    requestMeasurement: vi.fn().mockResolvedValue(createMeasurement()),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useContextUsage", () => {
  it("measures the transcript and reports a resolved view", async () => {
    const measurement = createMeasurement();
    const { result } = renderHook(() =>
      useContextUsage(baseOptions({ requestMeasurement: vi.fn().mockResolvedValue(measurement) }))
    );

    expect(result.current.usage).toBeNull();
    expect(result.current.phase).toBe("measuring");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.phase).toBe("measured");
    expect(result.current.usage?.totalTokens).toBe(measurement.inputTokens);
    expect(
      result.current.usage?.rows.reduce((sum, row) => sum + row.tokens, 0)
    ).toBe(result.current.usage?.totalTokens);
  });

  /**
   * The core regression. The old hook nulled its result on every dependency
   * change, so typing swapped the display to a different estimator and back.
   */
  it("keeps the anchor and schedules no request while the user types", async () => {
    const requestMeasurement = vi.fn().mockResolvedValue(createMeasurement());
    const { result, rerender } = renderHook(
      (props: { draft: UseContextUsageOptions["draft"] }) =>
        useContextUsage(baseOptions({ requestMeasurement, draft: props.draft })),
      { initialProps: { draft: { text: "", imageAttachmentCount: 0, referenceBlockChars: 0 } } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const measuredTotal = result.current.usage?.totalTokens ?? 0;
    expect(requestMeasurement).toHaveBeenCalledTimes(1);

    rerender({ draft: { text: "a".repeat(370), imageAttachmentCount: 0, referenceBlockChars: 0 } });

    // The number moves by the locally priced draft, and never blanks.
    expect(result.current.usage).not.toBeNull();
    expect(result.current.usage?.totalTokens).toBe(measuredTotal + 100);
    expect(result.current.usage?.hasLocalDelta).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(requestMeasurement).toHaveBeenCalledTimes(1);
  });

  it("keeps the last known number when a measurement fails", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const requestMeasurement = vi
      .fn()
      .mockResolvedValueOnce(createMeasurement())
      .mockRejectedValueOnce(new Error("measurement unavailable"));
    const { result, rerender } = renderHook(
      (props: { messages: UIMessage[] }) =>
        useContextUsage(baseOptions({ requestMeasurement, messages: props.messages })),
      { initialProps: { messages: MESSAGES } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const measuredTotal = result.current.usage?.totalTokens;

    rerender({
      messages: [...MESSAGES, { id: "a1", role: "assistant", parts: [] }] as UIMessage[],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // A failure is reported as such rather than being indistinguishable from
    // "not measured yet", and the previous number stays on screen.
    expect(result.current.phase).toBe("unavailable");
    expect(result.current.usage?.totalTokens).toBe(measuredTotal);
  });

  it("drops the anchor when the model changes", async () => {
    const requestMeasurement = vi.fn().mockResolvedValue(createMeasurement());
    const { result, rerender } = renderHook(
      (props: { modelKey: string }) =>
        useContextUsage(baseOptions({ requestMeasurement, modelKey: props.modelKey })),
      { initialProps: { modelKey: "openai/gpt-5" } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.usage).not.toBeNull();

    // A different model means a different window, tokenizer and calibration —
    // carrying the old number over would be confidently wrong.
    rerender({ modelKey: "anthropic/claude-opus-5" });
    expect(result.current.usage).toBeNull();
    expect(result.current.phase).toBe("measuring");
  });

  it("drops the anchor after a compaction", async () => {
    const requestMeasurement = vi.fn().mockResolvedValue(createMeasurement());
    const { result, rerender } = renderHook(
      (props: { compactionEpoch: number }) =>
        useContextUsage(
          baseOptions({ requestMeasurement, compactionEpoch: props.compactionEpoch })
        ),
      { initialProps: { compactionEpoch: 0 } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.usage).not.toBeNull();

    rerender({ compactionEpoch: 1 });
    expect(result.current.usage).toBeNull();
  });

  it("suspends background measurement while a turn is in flight", async () => {
    const requestMeasurement = vi.fn().mockResolvedValue(createMeasurement());
    renderHook(() => useContextUsage(baseOptions({ requestMeasurement, isTurnActive: true })));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(requestMeasurement).not.toHaveBeenCalled();
  });

  it("prefers an explicit measurement over older in-flight work", async () => {
    let resolveOlder: ((value: ContextMeasurement) => void) | undefined;
    let olderSignal: AbortSignal | undefined;
    const requestMeasurement = vi.fn((_messages: UIMessage[], signal: AbortSignal) => {
      olderSignal = signal;
      return new Promise<ContextMeasurement>((resolve) => {
        resolveOlder = resolve;
      });
    });
    const explicit = createMeasurement({ inputTokens: 42_000, measuredAt: "2026-08-14T01:00:00.000Z" });
    const { result } = renderHook(() => useContextUsage(baseOptions({ requestMeasurement })));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(requestMeasurement).toHaveBeenCalledTimes(1);

    act(() => result.current.setAnchor(explicit));
    expect(olderSignal?.aborted).toBe(true);
    expect(result.current.usage?.totalTokens).toBe(42_000);

    await act(async () => {
      resolveOlder?.(createMeasurement({ inputTokens: 999 }));
      await Promise.resolve();
    });
    expect(result.current.usage?.totalTokens).toBe(42_000);
  });

  it("seeds an exact anchor from the provider count on the last assistant message", async () => {
    const provider = createMeasurement({
      kind: "provider",
      confidence: "exact",
      inputTokens: 31_500,
      measuredAt: "2026-08-14T02:00:00.000Z",
    });
    const messages = [
      ...MESSAGES,
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
        metadata: { contextUsage: provider },
      },
    ] as UIMessage[];

    const { result } = renderHook(() =>
      useContextUsage(
        baseOptions({
          messages,
          requestMeasurement: vi.fn(() => new Promise<ContextMeasurement>(() => {})),
        })
      )
    );

    // Available immediately, before any server round trip.
    expect(result.current.usage?.source).toBe("provider");
    expect(result.current.usage?.confidence).toBe("exact");
    // The reply itself is not covered by the measurement that produced it.
    expect(result.current.usage?.totalTokens).toBeGreaterThanOrEqual(31_500);
  });

  it("reports idle for an empty chat and never measures it", async () => {
    const requestMeasurement = vi.fn().mockResolvedValue(createMeasurement());
    const { result } = renderHook(() =>
      useContextUsage(baseOptions({ messages: [], requestMeasurement }))
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.usage).toBeNull();
    expect(requestMeasurement).not.toHaveBeenCalled();
  });
});
