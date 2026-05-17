"use client";

import { useState, useEffect } from "react";

import type { KernelService } from "@/lib/kernel/kernel-service";

/**
 * Tracks Jupyter server and kernel connectivity for UI gating.
 *
 * - `serverAvailable` — the Jupyter server responded successfully.
 *   Use this to gate server-dependent UI such as the file tree and terminal,
 *   which only require a live server connection, not an active kernel.
 *
 * - `hasConnectedKernel` — at least one kernel session is active.
 *   Use this to gate kernel-dependent UI such as cell execution controls.
 *
 * - `isReady` — convenience combination of both (server + kernel).
 */
export function useJupyterShellReady(kernelService: KernelService | null) {
  const [serverAvailable, setServerAvailable] = useState(false);
  const [hasConnectedKernel, setHasConnectedKernel] = useState(false);

  useEffect(() => {
    if (!kernelService) {
      setServerAvailable(false);
      setHasConnectedKernel(false);
      return;
    }

    let cancelled = false;
    void kernelService.testConnection().then((ok) => {
      if (!cancelled) setServerAvailable(ok);
    });

    return () => {
      cancelled = true;
    };
  }, [kernelService]);

  useEffect(() => {
    if (!kernelService) {
      setHasConnectedKernel(false);
      return;
    }

    const syncKernelConnectionState = () => {
      setHasConnectedKernel(Boolean(kernelService.getKernel()));
    };

    syncKernelConnectionState();
    const unsubscribeSessions = kernelService.onSessionsChanged(syncKernelConnectionState);
    const unsubscribeStatus = kernelService.onStatusChanged(syncKernelConnectionState);

    return () => {
      unsubscribeSessions();
      unsubscribeStatus();
    };
  }, [kernelService]);

  const isReady = Boolean(
    kernelService && serverAvailable && hasConnectedKernel
  );

  return { isReady, serverAvailable, hasConnectedKernel };
}
