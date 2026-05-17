"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { KernelSidecar, type VariableSummary } from "@/lib/agent/kernel-sidecar";
import type { KernelService } from "@/lib/kernel/kernel-service";

// ============================================================================
// Types
// ============================================================================

export interface VariableEntry {
  name: string;
  type: string;
  shape?: number[];
  length?: number;
  /** Short repr / summary from the kernel for hover preview */
  repr?: string;
}

export interface UseKernelVariablesReturn {
  variables: VariableEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  inspect: (name: string) => Promise<VariableSummary>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Manages a lightweight KernelSidecar instance for variable inspection.
 * Creates and disposes the sidecar in sync with kernelService changes.
 *
 * Auto-refresh strategy:
 *   We listen for `execute_input` messages to detect user-visible code execution.
 *   `execute_input` is only emitted for non-silent, store_history executions —
 *   it is NOT emitted by our bootstrap (silent=true) or by Comm message handling.
 *   After seeing an `execute_input`, we wait for the following `status: idle`
 *   and then do a debounced refresh. This avoids the busy/idle loop that would
 *   occur if we keyed off `status` messages alone.
 */
export function useKernelVariables(
  kernelService: KernelService | null
): UseKernelVariablesReturn {
  const sidecarRef = useRef<KernelSidecar | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only set when an execute_input has been observed since last idle
  const pendingRefreshRef = useRef(false);

  const [variables, setVariables] = useState<VariableEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);

  useEffect(() => {
    if (!kernelService) {
      setActiveSessionKey(null);
      return;
    }

    const getActiveSessionKey = () => {
      const activePath = kernelService.getActivePath();
      if (!activePath) return null;

      const activeSession = kernelService
        .listActiveSessions()
        .find((session) => session.isActive);
      return `${activePath}:${activeSession?.kernelId ?? "unknown"}`;
    };

    const syncActiveSessionKey = () => {
      setActiveSessionKey(getActiveSessionKey());
    };

    syncActiveSessionKey();
    return kernelService.onSessionsChanged(syncActiveSessionKey);
  }, [kernelService]);

  /** Fetch the variable list from the kernel. */
  const refresh = useCallback(async () => {
    const sidecar = sidecarRef.current;
    if (!sidecar) return;

    setLoading(true);
    setError(null);
    try {
      const vars = await sidecar.listVariables();
      if (sidecarRef.current !== sidecar) return;
      setVariables(vars);
    } catch (err) {
      if (sidecarRef.current !== sidecar) return;
      setError(err instanceof Error ? err.message : "Failed to list variables");
    } finally {
      if (sidecarRef.current !== sidecar) return;
      setLoading(false);
    }
  }, []);

  /** Inspect a single variable, returning a rich summary. */
  const inspect = useCallback(async (name: string): Promise<VariableSummary> => {
    const sidecar = sidecarRef.current;
    if (!sidecar) {
      return { name, type: "unknown", error: "No kernel connected", timestamp: Date.now() };
    }
    return sidecar.inspectVariable(name);
  }, []);

  // Create/dispose KernelSidecar when the active kernel session changes.
  useEffect(() => {
    if (!kernelService || !activeSessionKey) {
      sidecarRef.current?.reset();
      sidecarRef.current = null;
      setVariables([]);
      setLoading(false);
      setError(null);
      return;
    }

    const sidecar = new KernelSidecar(kernelService);
    sidecarRef.current = sidecar;
    pendingRefreshRef.current = false;
    let disposed = false;

    /**
     * Listen for execute_input (user-visible execution) as the refresh trigger.
     * execute_input is NOT emitted for silent=true executions or Comm messages,
     * so this avoids looping back on our own bootstrap / listVariables calls.
     */
    const unsubscribe = sidecar.onMessage((msg) => {
      const msgType = msg.header?.msg_type;

      if (msgType === "execute_input") {
        // User ran code — mark that a refresh should happen on the next idle
        pendingRefreshRef.current = true;
      } else if (msgType === "status") {
        const executionState = msg.content?.execution_state as string | undefined;

        if (executionState === "idle" && pendingRefreshRef.current) {
          pendingRefreshRef.current = false;

          // Debounce: cancel any pending timer before scheduling a new one
          if (debounceTimerRef.current !== null) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;
            const s = sidecarRef.current;
            if (!s || disposed || s !== sidecar) return;
            setLoading(true);
            setError(null);
            s.listVariables()
              .then((vars) => {
                if (disposed || sidecarRef.current !== s) return;
                setVariables(vars);
              })
              .catch((err) =>
                disposed || sidecarRef.current !== s
                  ? null
                  : setError(err instanceof Error ? err.message : "Failed to list variables")
              )
              .finally(() => {
                if (disposed || sidecarRef.current !== s) return;
                setLoading(false);
              });
          }, 500);
        } else if (executionState === "restarting") {
          // Kernel restarted — clear variables and pending state
          setVariables([]);
          pendingRefreshRef.current = false;
        }
      }
    });

    // Initial load on connect
    setLoading(true);
    setError(null);
    sidecar
      .listVariables()
      .then((vars) => {
        if (disposed || sidecarRef.current !== sidecar) return;
        setVariables(vars);
      })
      .catch((err) => {
        if (disposed || sidecarRef.current !== sidecar) return;
        setError(err instanceof Error ? err.message : "Failed to list variables");
      })
      .finally(() => {
        if (disposed || sidecarRef.current !== sidecar) return;
        setLoading(false);
      });

    return () => {
      disposed = true;
      unsubscribe();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (sidecarRef.current === sidecar) {
        sidecarRef.current = null;
      }
      sidecar.reset();
    };
  }, [activeSessionKey, kernelService]);

  return { variables, loading, error, refresh, inspect };
}
