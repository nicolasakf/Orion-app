"use client";

/**
 * Fade overlays at scroll overflow edges (`from-sidebar` → transparent).
 * Matches the scroll affordance used on expanded tool invocation results.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export type ScrollEdgeState = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};

const INITIAL_EDGES: ScrollEdgeState = {
  top: false,
  bottom: false,
  left: false,
  right: false,
};

/** Gradient overlay for scrollable areas (four edges). */
export function ScrollGradient({
  position,
}: {
  position: "top" | "bottom" | "left" | "right";
}) {
  const styles: Record<string, string> = {
    top: "inset-x-0 top-0 h-4 bg-gradient-to-b from-sidebar to-transparent",
    bottom: "inset-x-0 bottom-0 h-4 bg-gradient-to-t from-sidebar to-transparent",
    left: "inset-y-0 left-0 w-4 bg-gradient-to-r from-sidebar to-transparent",
    right: "inset-y-0 right-0 w-4 bg-gradient-to-l from-sidebar to-transparent",
  };

  return (
    <div
      className={cn("pointer-events-none absolute z-10", styles[position])}
      aria-hidden
    />
  );
}

type UseScrollEdgeIndicatorsOptions = {
  /** When false, clears edges and skips listeners/observers */
  active?: boolean;
  /** Bump when nested content/layout may change (e.g. async highlight). */
  contentKey?: string | number | boolean | null | undefined;
};

/** Which edges may show a fade overlay (omit top for sticky table headers). */
export type ScrollEdgeMask = Partial<Record<keyof ScrollEdgeState, boolean>>;

/**
 * Tracks overflow on each scroll edge for matching fade overlays.
 */
export function useScrollEdgeIndicators(
  options: UseScrollEdgeIndicatorsOptions = {}
): {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  scrollEdges: ScrollEdgeState;
} {
  const { active = true, contentKey } = options;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = React.useState<ScrollEdgeState>(INITIAL_EDGES);

  const updateScrollEdges = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollLeft, scrollHeight, clientHeight, scrollWidth, clientWidth } = el;
    setScrollEdges({
      top: scrollTop > 0,
      bottom: scrollTop + clientHeight < scrollHeight - 1,
      left: scrollLeft > 0,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!active) {
      setScrollEdges(INITIAL_EDGES);
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    updateScrollEdges();
    el.addEventListener("scroll", updateScrollEdges);

    const ro = new ResizeObserver(updateScrollEdges);
    ro.observe(el);
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);

    return () => {
      el.removeEventListener("scroll", updateScrollEdges);
      ro.disconnect();
    };
  }, [active, contentKey, updateScrollEdges]);

  return { scrollRef, scrollEdges };
}

/**
 * Renders {@link ScrollGradient} overlays for edges that overflow.
 * Optionally skip edges (e.g. top fade with sticky thead).
 */
export function ScrollGradientOverlays({
  edges,
  show,
}: {
  edges: ScrollEdgeState;
  show?: ScrollEdgeMask;
}) {
  const top = show?.top !== false && edges.top;
  const bottom = show?.bottom !== false && edges.bottom;
  const left = show?.left !== false && edges.left;
  const right = show?.right !== false && edges.right;

  return (
    <>
      {top && <ScrollGradient position="top" />}
      {bottom && <ScrollGradient position="bottom" />}
      {left && <ScrollGradient position="left" />}
      {right && <ScrollGradient position="right" />}
    </>
  );
}
