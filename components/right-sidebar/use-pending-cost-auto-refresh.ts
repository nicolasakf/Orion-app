"use client";

import * as React from "react";

/** Bounded retry cadence used while Vercel cost reconciliation remains pending. */
export const PENDING_COST_AUTO_REFRESH_DELAYS_MS = [2_000, 5_000, 15_000] as const;

interface PendingCostAutoRefreshOptions {
  refreshKey: string | null;
  pendingRequestCount: number;
  /** A new snapshot identity signals that the prior refresh completed. */
  summarySnapshot: unknown;
  onRefresh: () => void;
}

interface PendingCostAutoRefreshState {
  refreshKey: string | null;
  nextDelayIndex: number;
}

/**
 * Runs a bounded sequence of automatic cost refreshes for one visible summary.
 * The returned reset cancels the current timer and gives a manual refresh a new
 * bounded retry window once its updated summary snapshot arrives.
 */
export function usePendingCostAutoRefresh({
  refreshKey,
  pendingRequestCount,
  summarySnapshot,
  onRefresh,
}: PendingCostAutoRefreshOptions): () => void {
  const stateRef = React.useRef<PendingCostAutoRefreshState>({
    refreshKey: null,
    nextDelayIndex: 0,
  });
  const timeoutRef = React.useRef<number | null>(null);

  /** Cancels any scheduled refresh without invoking its callback. */
  const clearScheduledRefresh = React.useCallback((): void => {
    if (timeoutRef.current === null) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const reset = React.useCallback((): void => {
    clearScheduledRefresh();
    stateRef.current = { refreshKey, nextDelayIndex: 0 };
  }, [clearScheduledRefresh, refreshKey]);

  React.useEffect(() => {
    clearScheduledRefresh();

    if (!refreshKey || pendingRequestCount === 0) {
      stateRef.current = { refreshKey, nextDelayIndex: 0 };
      return;
    }

    if (stateRef.current.refreshKey !== refreshKey) {
      stateRef.current = { refreshKey, nextDelayIndex: 0 };
    }

    const delayIndex = stateRef.current.nextDelayIndex;
    const delayMs = PENDING_COST_AUTO_REFRESH_DELAYS_MS[delayIndex];
    if (delayMs === undefined) return;

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      stateRef.current = {
        refreshKey,
        nextDelayIndex: delayIndex + 1,
      };
      onRefresh();
    }, delayMs);

    return clearScheduledRefresh;
  }, [
    clearScheduledRefresh,
    onRefresh,
    pendingRequestCount,
    refreshKey,
    summarySnapshot,
  ]);

  return reset;
}
