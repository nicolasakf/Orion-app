import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextPreflightResult } from "@/lib/agent/context-preflight";

import { useDebouncedContextPreflight } from "./use-debounced-context-preflight";

/** Builds the minimum complete preflight result used by hook tests. */
function createPreflightResult(modelId: string): ContextPreflightResult {
  return {
    version: 1,
    model: {
      providerId: "openai",
      modelId,
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
    measurement: {
      rawInputTokens: 1_000,
      estimatedInputTokens: 1_150,
      percentUsed: 1_150 / 190_000,
      status: "ok",
      confidence: "low",
      calibrationSampleCount: 0,
      breakdown: {
        system: 500,
        messages: 400,
        tools: 80,
        images: 0,
        framing: 20,
      },
    },
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

describe("useDebouncedContextPreflight", () => {
  it("invalidates an old result immediately and keeps fallback state after replacement failure", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const first = createPreflightResult("gpt-first");
    const firstRequest = vi.fn().mockResolvedValue(first);
    const failedRequest = vi.fn().mockRejectedValue(new Error("preflight unavailable"));
    const { result, rerender } = renderHook(
      (props: {
        request: (signal: AbortSignal) => Promise<ContextPreflightResult>;
      }) => useDebouncedContextPreflight(props.request),
      { initialProps: { request: firstRequest } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current[0]).toEqual(first);

    rerender({ request: failedRequest });
    expect(result.current[0]).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(failedRequest).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBeNull();
  });

  it("ignores an older request that resolves after its input was aborted", async () => {
    const older = createPreflightResult("gpt-older");
    const newer = createPreflightResult("gpt-newer");
    let resolveOlder: ((value: ContextPreflightResult) => void) | undefined;
    let olderSignal: AbortSignal | undefined;
    const olderRequest = vi.fn((signal: AbortSignal) => {
      olderSignal = signal;
      return new Promise<ContextPreflightResult>((resolve) => {
        resolveOlder = resolve;
      });
    });
    const newerRequest = vi.fn().mockResolvedValue(newer);
    const { result, rerender } = renderHook(
      (props: {
        request: (signal: AbortSignal) => Promise<ContextPreflightResult>;
      }) => useDebouncedContextPreflight(props.request),
      { initialProps: { request: olderRequest } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(olderRequest).toHaveBeenCalledTimes(1);

    rerender({ request: newerRequest });
    expect(olderSignal?.aborted).toBe(true);
    expect(result.current[0]).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current[0]).toEqual(newer);

    await act(async () => {
      resolveOlder?.(older);
      await Promise.resolve();
    });
    expect(result.current[0]).toEqual(newer);
  });

  it("keeps an explicit measurement when older debounced work resolves later", async () => {
    const older = createPreflightResult("gpt-older");
    const explicit = createPreflightResult("gpt-explicit");
    let resolveOlder: ((value: ContextPreflightResult) => void) | undefined;
    let olderSignal: AbortSignal | undefined;
    const request = vi.fn((signal: AbortSignal) => {
      olderSignal = signal;
      return new Promise<ContextPreflightResult>((resolve) => {
        resolveOlder = resolve;
      });
    });
    const { result } = renderHook(() => useDebouncedContextPreflight(request));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(request).toHaveBeenCalledTimes(1);

    act(() => result.current[1](explicit));
    expect(olderSignal?.aborted).toBe(true);
    expect(result.current[0]).toEqual(explicit);

    await act(async () => {
      resolveOlder?.(older);
      await Promise.resolve();
    });
    expect(result.current[0]).toEqual(explicit);
  });
});
