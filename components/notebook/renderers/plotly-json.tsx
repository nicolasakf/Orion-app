"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { OutputContextMenu } from "@/components/notebook/output-context-menu";
import type { NotebookMimeRendererProps } from "./types";

const DEFAULT_PLOT_HEIGHT = 360;
const MIN_RESIZE_WIDTH = 160;
const MIN_RESIZE_HEIGHT = 120;

interface PlotlyFigure {
  data?: unknown[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
  frames?: unknown[];
}

type PlotlyEventName =
  | "plotly_afterplot"
  | "plotly_relayout"
  | "plotly_restyle"
  | "plotly_legendclick"
  | "plotly_legenddoubleclick";

interface PlotlyGraphNode extends HTMLDivElement {
  on?: (eventName: PlotlyEventName, handler: () => void) => void;
  removeListener?: (eventName: PlotlyEventName, handler: () => void) => void;
}

interface PlotlyLike {
  react: (
    root: HTMLDivElement,
    data: unknown[],
    layout: Record<string, unknown>,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
  addFrames: (root: HTMLDivElement, frames: unknown[]) => Promise<unknown>;
  redraw: (root: HTMLDivElement) => Promise<unknown>;
  purge: (root: HTMLDivElement) => void;
  Plots: {
    resize: (root: HTMLDivElement) => void;
  };
}

let plotlyLoader: Promise<PlotlyLike> | null = null;

/**
 * Lazily load plotly.js on the client to avoid SSR/runtime mismatch.
 */
async function loadPlotly(): Promise<PlotlyLike> {
  if (!plotlyLoader) {
    plotlyLoader = import(
      // @ts-expect-error plotly dist bundle does not ship typed entrypoints
      "plotly.js/dist/plotly"
    ).then((mod) => {
      const maybePlotly = (mod as unknown as { default?: PlotlyLike }).default;
      return maybePlotly ?? (mod as unknown as PlotlyLike);
    });
  }
  return plotlyLoader;
}

/**
 * Parse the Plotly MIME payload into a normalized figure object.
 */
function parsePlotlyFigure(value: unknown): PlotlyFigure {
  try {
    if (typeof value === "string") {
      return JSON.parse(value) as PlotlyFigure;
    }
    return (value ?? {}) as PlotlyFigure;
  } catch {
    return {};
  }
}

/**
 * Resolve a numeric plot height from arbitrary layout.height values.
 */
function resolvePlotHeight(layoutHeight: unknown): number {
  if (
    typeof layoutHeight === "number" &&
    Number.isFinite(layoutHeight) &&
    layoutHeight > 0
  ) {
    return layoutHeight;
  }

  if (typeof layoutHeight === "string") {
    const parsedHeight = Number(layoutHeight);
    if (Number.isFinite(parsedHeight) && parsedHeight > 0) {
      return parsedHeight;
    }
  }

  return DEFAULT_PLOT_HEIGHT;
}

/**
 * Render a Plotly JSON MIME bundle using imperative plotly.js lifecycle hooks.
 */
export function PlotlyJsonOutputRenderer({
  value,
  theme,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const {
    cellIndex,
    outputIndex,
    onClearOutput,
    onCopyOutput,
    onHideOutput,
    onToggleOutputAppView,
    isInAppView,
  } = actions;
  const canShowContextMenu = !!(onClearOutput && onCopyOutput && onHideOutput);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotNodeRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<PlotlyLike | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const removePlotlyListenersRef = useRef<(() => void) | null>(null);
  const renderEpochRef = useRef(0);
  const hasRenderedRef = useRef(false);
  const figure = useMemo(() => parsePlotlyFigure(value), [value]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const frameHeight = useMemo(
    () =>
      resolvePlotHeight(
        (figure.layout as Record<string, unknown> | undefined)?.height,
      ),
    [figure.layout],
  );

  /**
   * Execute a guarded resize pass for the current plot node.
   */
  const resizePlot = useCallback(() => {
    const host = containerRef.current;
    const node = plotNodeRef.current;
    const plotly = plotlyRef.current;
    if (!host || !node || !plotly || !hasRenderedRef.current) {
      return;
    }

    const hostRect = host.getBoundingClientRect();
    if (
      hostRect.width < MIN_RESIZE_WIDTH ||
      hostRect.height < MIN_RESIZE_HEIGHT
    ) {
      return;
    }

    try {
      plotly.Plots.resize(node);
    } catch {
      // Ignore transient resize errors while chart is remounting.
    }
  }, []);

  /**
   * Schedule a single resize on the next animation frame.
   */
  const queueResize = useCallback(() => {
    if (typeof window === "undefined" || resizeRafRef.current !== null) {
      return;
    }

    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null;
      resizePlot();
    });
  }, [resizePlot]);

  useEffect(() => {
    let isCancelled = false;
    const renderEpoch = ++renderEpochRef.current;

    const render = async () => {
      const node = plotNodeRef.current;
      if (!node) {
        return;
      }

      try {
        const plotly = await loadPlotly();
        if (isCancelled || renderEpoch !== renderEpochRef.current) {
          return;
        }
        plotlyRef.current = plotly;
        removePlotlyListenersRef.current?.();
        removePlotlyListenersRef.current = null;

        const layout: Record<string, unknown> = {
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          font: {
            color: theme === "dark" ? "#ffffff" : "#000000",
          },
          ...((figure.layout ?? {}) as Record<string, unknown>),
        };
        layout.height = resolvePlotHeight(layout.height);
        if (layout.width === undefined || layout.width === null) {
          layout.autosize = true;
        }

        const config = {
          displayModeBar: true,
          ...((figure.config ?? {}) as Record<string, unknown>),
          responsive: false,
        };

        await plotly.react(
          node,
          Array.isArray(figure.data) ? figure.data : [],
          layout,
          config,
        );
        if (isCancelled || renderEpoch !== renderEpochRef.current) {
          return;
        }

        if (Array.isArray(figure.frames) && figure.frames.length > 0) {
          await plotly.addFrames(node, figure.frames);
        }
        if (isCancelled || renderEpoch !== renderEpochRef.current) {
          return;
        }

        await plotly.redraw(node);
        if (isCancelled || renderEpoch !== renderEpochRef.current) {
          return;
        }

        hasRenderedRef.current = true;
        const graphNode = node as PlotlyGraphNode;
        const handlePlotInteraction = () => {
          queueResize();
        };
        if (typeof graphNode.on === "function") {
          const resizeEvents: PlotlyEventName[] = [
            "plotly_afterplot",
            "plotly_relayout",
            "plotly_restyle",
            "plotly_legendclick",
            "plotly_legenddoubleclick",
          ];
          for (const eventName of resizeEvents) {
            graphNode.on(eventName, handlePlotInteraction);
          }
          removePlotlyListenersRef.current = () => {
            if (typeof graphNode.removeListener !== "function") {
              return;
            }
            for (const eventName of resizeEvents) {
              graphNode.removeListener(eventName, handlePlotInteraction);
            }
          };
        }

        queueResize();
        setRenderError(null);
      } catch (error) {
        hasRenderedRef.current = false;
        setRenderError(
          error instanceof Error
            ? error.message
            : "Unknown Plotly render error",
        );
      }
    };

    void render();
    return () => {
      isCancelled = true;
      hasRenderedRef.current = false;
      removePlotlyListenersRef.current?.();
      removePlotlyListenersRef.current = null;
    };
  }, [figure, queueResize, theme]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      queueResize();
    });
    resizeObserver.observe(host);

    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          queueResize();
        }
      }
    });
    intersectionObserver.observe(host);

    const handleWindowResize = () => {
      queueResize();
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [queueResize]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      removePlotlyListenersRef.current?.();
      removePlotlyListenersRef.current = null;
      hasRenderedRef.current = false;

      const node = plotNodeRef.current;
      if (!node) {
        return;
      }
      void loadPlotly()
        .then((plotly) => {
          plotly.purge(node);
        })
        .catch(() => {
          // Best effort cleanup.
        });
    };
  }, []);

  if (renderError) {
    return (
      <div className="text-sm text-red-500 p-3">
        Error rendering Plotly chart: {renderError}
      </div>
    );
  }

  const plotHost = (
    <div
      ref={containerRef}
      className="w-full"
      style={{ minHeight: `${frameHeight}px` }}
    >
      <div
        ref={plotNodeRef}
        className="w-full"
        style={{ minHeight: `${frameHeight}px` }}
      />
    </div>
  );

  if (!canShowContextMenu) {
    return plotHost;
  }

  return (
    <OutputContextMenu
      cellIndex={cellIndex}
      outputIndex={outputIndex}
      onClearOutput={onClearOutput!}
      onCopyOutput={onCopyOutput!}
      onHideOutput={onHideOutput!}
      onToggleAppView={onToggleOutputAppView}
      isInAppView={!!isInAppView}
      presentationMenu={actions.presentationMenu ?? undefined}
    >
      {plotHost}
    </OutputContextMenu>
  );
}
