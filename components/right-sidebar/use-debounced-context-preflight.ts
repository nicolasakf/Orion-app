"use client";

import * as React from "react";

import type { ContextPreflightResult } from "@/lib/agent/context-preflight";

/**
 * Debounces context measurement while invalidating results from older inputs.
 * The setter lets an explicit pre-send measurement update the same UI state.
 */
export function useDebouncedContextPreflight(
  requestPreflight: (signal: AbortSignal) => Promise<ContextPreflightResult>,
  delayMs = 300
): readonly [
  ContextPreflightResult | null,
  React.Dispatch<React.SetStateAction<ContextPreflightResult | null>>,
] {
  const [result, setResult] = React.useState<ContextPreflightResult | null>(null);
  const activeControllerRef = React.useRef<AbortController | null>(null);
  const requestVersionRef = React.useRef(0);

  /** Installs an explicit measurement and prevents older debounced work from replacing it. */
  const setCurrentResult = React.useCallback<
    React.Dispatch<React.SetStateAction<ContextPreflightResult | null>>
  >((nextResult) => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    requestVersionRef.current += 1;
    setResult(nextResult);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    activeControllerRef.current = controller;
    setResult(null);

    const timer = window.setTimeout(() => {
      if (
        controller.signal.aborted ||
        requestVersionRef.current !== requestVersion
      ) {
        return;
      }
      void requestPreflight(controller.signal)
        .then((nextResult) => {
          if (
            !controller.signal.aborted &&
            requestVersionRef.current === requestVersion
          ) {
            setResult(nextResult);
          }
        })
        .catch((error) => {
          if (
            !controller.signal.aborted &&
            requestVersionRef.current === requestVersion
          ) {
            setResult(null);
            console.debug("Context preflight unavailable:", error);
          }
        });
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    };
  }, [delayMs, requestPreflight]);

  return [result, setCurrentResult] as const;
}
