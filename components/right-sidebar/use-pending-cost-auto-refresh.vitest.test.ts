import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PENDING_COST_AUTO_REFRESH_DELAYS_MS,
  usePendingCostAutoRefresh,
} from "./use-pending-cost-auto-refresh";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("usePendingCostAutoRefresh", () => {
  it("stops after the bounded progressive retry sequence", async () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(
      (props: { snapshot: object }) =>
        usePendingCostAutoRefresh({
          refreshKey: "chat-1:cost-1",
          pendingRequestCount: 1,
          summarySnapshot: props.snapshot,
          onRefresh,
        }),
      { initialProps: { snapshot: { revision: 0 } } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_COST_AUTO_REFRESH_DELAYS_MS[0]);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender({ snapshot: { revision: 1 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_COST_AUTO_REFRESH_DELAYS_MS[1]);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);

    rerender({ snapshot: { revision: 2 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_COST_AUTO_REFRESH_DELAYS_MS[2]);
    });
    expect(onRefresh).toHaveBeenCalledTimes(3);

    rerender({ snapshot: { revision: 3 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it("cancels scheduled work and gives manual refreshes a fresh retry window", async () => {
    const onRefresh = vi.fn();
    const { result, rerender, unmount } = renderHook(
      (props: { refreshKey: string | null; pending: number; snapshot: object }) =>
        usePendingCostAutoRefresh({
          refreshKey: props.refreshKey,
          pendingRequestCount: props.pending,
          summarySnapshot: props.snapshot,
          onRefresh,
        }),
      {
        initialProps: {
          refreshKey: "chat-1:cost-1",
          pending: 1,
          snapshot: { revision: 0 },
        },
      }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_COST_AUTO_REFRESH_DELAYS_MS[0]);
    });
    rerender({
      refreshKey: "chat-1:cost-1",
      pending: 1,
      snapshot: { revision: 1 },
    });

    act(() => result.current());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_COST_AUTO_REFRESH_DELAYS_MS[1]);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender({
      refreshKey: "chat-1:cost-1",
      pending: 1,
      snapshot: { revision: 2 },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_COST_AUTO_REFRESH_DELAYS_MS[0]);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);

    rerender({
      refreshKey: "chat-1:cost-1",
      pending: 0,
      snapshot: { revision: 3 },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);

    rerender({
      refreshKey: "chat-2:cost-2",
      pending: 1,
      snapshot: { revision: 0 },
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });
});
