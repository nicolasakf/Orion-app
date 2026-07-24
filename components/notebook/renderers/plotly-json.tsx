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
const FALLBACK_SANS_FONT_FAMILY = "Saira, ui-sans-serif, system-ui, sans-serif";
const ORION_PLOTLY_HOVER_CORNER_RATIO = 0.15;

/**
 * Resolve the app sans-serif stack so Plotly matches Orion's Next.js Saira bundle.
 */
function resolveOrionSansFontFamily(): string {
  if (typeof document === "undefined") {
    return FALLBACK_SANS_FONT_FAMILY;
  }

  const sansFromRoot = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-sans")
    .trim();

  return sansFromRoot || FALLBACK_SANS_FONT_FAMILY;
}

/**
 * Build an SVG path for a rounded rectangle aligned with Orion bar rounding.
 */
function buildRoundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) {
    return `M${x},${y}h${width}v${height}h${-width}Z`;
  }

  return [
    `M${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height - r}`,
    `Q${x + width},${y + height} ${x + width - r},${y + height}`,
    `H${x + r}`,
    `Q${x},${y + height} ${x},${y + height - r}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    "Z",
  ].join("");
}

/**
 * Plotly draws axis-aligned rectangles as compact M/h/v paths when no arrow is used.
 */
function isSimpleRectPath(pathData: string): boolean {
  const normalized = pathData.replace(/\s+/g, "");
  return /^M-?[\d.]+,-?[\d.]+h-?[\d.]+v-?[\d.]+h-?[\d.]+Z$/i.test(normalized);
}

/**
 * Resolve hover-label corner radius using the same ratio as Orion bar rounding.
 */
function resolveHoverCornerRadius(width: number, height: number): number {
  return Math.min(
    width * ORION_PLOTLY_HOVER_CORNER_RATIO,
    height * ORION_PLOTLY_HOVER_CORNER_RATIO,
    width / 2,
    height / 2,
  );
}

interface EditorToolbarShellStyles {
  backgroundColor: string;
  borderColor: string;
  borderWidth: string;
  dropShadowFilter: string;
  foregroundColor: string;
}

/** Same shell classes as the floating notebook editor toolbar in app/page.tsx. */
const EDITOR_TOOLBAR_SHELL_CLASS =
  "pointer-events-none invisible absolute rounded-md border bg-background text-foreground shadow-md";

const FALLBACK_SHELL_STYLES_LIGHT: EditorToolbarShellStyles = {
  backgroundColor: "hsl(0 0% 99%)",
  borderColor: "hsl(0 0% 89.8%)",
  borderWidth: "1px",
  dropShadowFilter:
    "drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1)) drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))",
  foregroundColor: "hsl(0 0% 3.9%)",
};

const FALLBACK_SHELL_STYLES_DARK: EditorToolbarShellStyles = {
  backgroundColor: "hsl(0 0% 3.9%)",
  borderColor: "hsl(0 0% 14.9%)",
  borderWidth: "1px",
  dropShadowFilter:
    "drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1)) drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))",
  foregroundColor: "hsl(0 0% 98%)",
};

const ORION_PLOTLY_HOVER_SHADOW_FILTER_ID = "orion-plotly-hover-shadow";

const BOX_SHADOW_COLOR_PATTERN =
  "(?:rgba\\([^)]+\\)|rgb\\([^)]+\\)|hsla?\\([^)]+\\)|#[0-9a-fA-F]{3,8})";
const BOX_SHADOW_LENGTH_PATTERN = "-?\\d+(?:\\.\\d+)?(?:px)?";
const BOX_SHADOW_OFFSET_FIRST_PATTERN = new RegExp(
  `^(${BOX_SHADOW_LENGTH_PATTERN})\\s+(${BOX_SHADOW_LENGTH_PATTERN})\\s+(${BOX_SHADOW_LENGTH_PATTERN})(?:\\s+${BOX_SHADOW_LENGTH_PATTERN})?\\s+(${BOX_SHADOW_COLOR_PATTERN})$`,
  "i",
);
const BOX_SHADOW_COLOR_FIRST_PATTERN = new RegExp(
  `^(${BOX_SHADOW_COLOR_PATTERN})\\s+(${BOX_SHADOW_LENGTH_PATTERN})\\s+(${BOX_SHADOW_LENGTH_PATTERN})\\s+(${BOX_SHADOW_LENGTH_PATTERN})(?:\\s+${BOX_SHADOW_LENGTH_PATTERN})?$`,
  "i",
);

/**
 * Normalize any CSS color syntax into computed rgb()/rgba() for SVG filters.
 */
function normalizeCssColor(color: string): string {
  if (typeof document === "undefined") {
    return color;
  }

  const probe = document.createElement("div");
  probe.style.color = color;
  document.body.appendChild(probe);
  const normalized = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return normalized || color;
}

/**
 * Convert a computed CSS box-shadow into chained SVG drop-shadow filters.
 */
function boxShadowToDropShadowFilter(boxShadow: string): string {
  if (!boxShadow || boxShadow === "none") {
    return "none";
  }

  const layers = boxShadow.split(/,(?=\s*(?:rgba|rgb|hsl|#|-?\d))/i);
  const dropShadows = layers
    .map((layer) => {
      const trimmed = layer.trim();
      let match = trimmed.match(BOX_SHADOW_OFFSET_FIRST_PATTERN);
      if (match) {
        return `drop-shadow(${match[1]} ${match[2]} ${match[3]} ${normalizeCssColor(match[4])})`;
      }

      match = trimmed.match(BOX_SHADOW_COLOR_FIRST_PATTERN);
      if (match) {
        return `drop-shadow(${match[2]} ${match[3]} ${match[4]} ${normalizeCssColor(match[1])})`;
      }

      return null;
    })
    .filter((value): value is string => value !== null);

  return dropShadows.length > 0 ? dropShadows.join(" ") : "none";
}

/**
 * Install an SVG feDropShadow filter so hover-card shadows survive plot clipping.
 */
function ensurePlotlyHoverShadowFilter(plotNode: HTMLDivElement): string | null {
  const svg = plotNode.querySelector("svg.main-svg");
  if (!svg) {
    return null;
  }

  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  if (defs.querySelector(`#${ORION_PLOTLY_HOVER_SHADOW_FILTER_ID}`)) {
    return `url(#${ORION_PLOTLY_HOVER_SHADOW_FILTER_ID})`;
  }

  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", ORION_PLOTLY_HOVER_SHADOW_FILTER_ID);
  filter.setAttribute("x", "-50%");
  filter.setAttribute("y", "-50%");
  filter.setAttribute("width", "200%");
  filter.setAttribute("height", "200%");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const primaryShadow = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "feDropShadow",
  );
  primaryShadow.setAttribute("dx", "0");
  primaryShadow.setAttribute("dy", "4");
  primaryShadow.setAttribute("stdDeviation", "3");
  primaryShadow.setAttribute("flood-color", "rgba(0, 0, 0, 0.1)");

  filter.appendChild(primaryShadow);
  defs.appendChild(filter);

  return `url(#${ORION_PLOTLY_HOVER_SHADOW_FILTER_ID})`;
}

/**
 * Read the editor toolbar shell styles from the same Tailwind classes it uses.
 */
function resolveEditorToolbarShellStyles(
  colorTheme: "dark" | "light",
): EditorToolbarShellStyles {
  if (typeof document === "undefined") {
    return colorTheme === "dark"
      ? FALLBACK_SHELL_STYLES_DARK
      : FALLBACK_SHELL_STYLES_LIGHT;
  }

  const probe = document.createElement("div");
  probe.className = EDITOR_TOOLBAR_SHELL_CLASS;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe);
  const parsedShadow = boxShadowToDropShadowFilter(computed.boxShadow);
  const fallbackShadow =
    colorTheme === "dark"
      ? FALLBACK_SHELL_STYLES_DARK.dropShadowFilter
      : FALLBACK_SHELL_STYLES_LIGHT.dropShadowFilter;
  const styles: EditorToolbarShellStyles = {
    backgroundColor: computed.backgroundColor,
    borderColor: computed.borderColor,
    borderWidth: computed.borderTopWidth,
    dropShadowFilter: parsedShadow !== "none" ? parsedShadow : fallbackShadow,
    foregroundColor: computed.color,
  };
  document.body.removeChild(probe);
  return styles;
}

/**
 * Style Plotly hover cards to match the floating editor toolbar shell.
 */
function stylePlotlyHoverLabels(
  plotNode: HTMLDivElement,
  shellStyles: EditorToolbarShellStyles,
): void {
  const hoverLayer = plotNode.querySelector(".hoverlayer");
  if (!hoverLayer) {
    return;
  }

  const shadowFilter =
    ensurePlotlyHoverShadowFilter(plotNode) ?? shellStyles.dropShadowFilter;

  hoverLayer.querySelectorAll("g.hovertext, g.axistext").forEach((group) => {
    group.querySelectorAll<SVGPathElement | SVGRectElement>("path, rect").forEach(
      (shape) => {
        shape.style.fill = shellStyles.backgroundColor;
        shape.style.stroke = shellStyles.borderColor;
        shape.style.strokeWidth = shellStyles.borderWidth;
        shape.style.strokeLinejoin = "round";
        shape.setAttribute("filter", shadowFilter);

        if (shape instanceof SVGRectElement) {
          const width = shape.width.baseVal.value;
          const height = shape.height.baseVal.value;
          const radius = resolveHoverCornerRadius(width, height);
          shape.setAttribute("rx", String(radius));
          shape.setAttribute("ry", String(radius));
          return;
        }

        const pathData = shape.getAttribute("d");
        if (!pathData || !isSimpleRectPath(pathData)) {
          return;
        }

        const bbox = shape.getBBox();
        if (bbox.width <= 0 || bbox.height <= 0) {
          return;
        }

        const radius = resolveHoverCornerRadius(bbox.width, bbox.height);
        shape.setAttribute(
          "d",
          buildRoundedRectPath(bbox.x, bbox.y, bbox.width, bbox.height, radius),
        );
      },
    );
  });
}

/**
 * Keep Plotly hover cards styled as Orion mutates the hover layer on pointer move.
 */
function attachPlotlyHoverLabelStyling(
  plotNode: HTMLDivElement,
  colorTheme: "dark" | "light",
): () => void {
  const hoverLayer = plotNode.querySelector(".hoverlayer");
  if (!hoverLayer) {
    return () => { };
  }

  const shellStyles = resolveEditorToolbarShellStyles(colorTheme);

  const applyStyles = () => {
    stylePlotlyHoverLabels(plotNode, shellStyles);
  };

  const observer = new MutationObserver(() => {
    applyStyles();
  });

  observer.observe(hoverLayer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["d", "transform", "width", "height", "x", "y"],
  });

  const graphNode = plotNode as PlotlyGraphNode;
  const handlePlotlyHover = () => {
    applyStyles();
  };
  if (typeof graphNode.on === "function") {
    graphNode.on("plotly_hover", handlePlotlyHover);
  }

  applyStyles();

  return () => {
    observer.disconnect();
    if (typeof graphNode.removeListener === "function") {
      graphNode.removeListener("plotly_hover", handlePlotlyHover);
    }
  };
}

/**
 * Build Orion hover-label defaults merged with any figure-specific overrides.
 */
function buildOrionHoverLabel(
  figureHoverLabel: Record<string, unknown> | undefined,
  shellStyles: EditorToolbarShellStyles,
): Record<string, unknown> {
  const figureHoverFont =
    typeof figureHoverLabel?.font === "object" && figureHoverLabel.font !== null
      ? (figureHoverLabel.font as Record<string, unknown>)
      : {};

  return {
    ...figureHoverLabel,
    bgcolor: shellStyles.backgroundColor,
    bordercolor: shellStyles.borderColor,
    showarrow: figureHoverLabel?.showarrow ?? false,
    font: {
      ...figureHoverFont,
      family: resolveOrionSansFontFamily(),
      color: shellStyles.foregroundColor,
      size: figureHoverFont.size ?? 13,
    },
  };
}

interface PlotlyFigure {
  data?: unknown[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
  frames?: unknown[];
}

type PlotlyEventName =
  | "plotly_afterplot"
  | "plotly_hover"
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
 * Resolve a numeric plot width from arbitrary layout.width values.
 */
function resolvePlotWidth(layoutWidth: unknown): number | null {
  if (
    typeof layoutWidth === "number" &&
    Number.isFinite(layoutWidth) &&
    layoutWidth > 0
  ) {
    return layoutWidth;
  }

  if (typeof layoutWidth === "string") {
    const parsedWidth = Number(layoutWidth);
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) {
      return parsedWidth;
    }
  }

  return null;
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
    onMentionOutput,
    onGoToSource,
    onToggleOutputAppView,
    isInAppView,
    businessMode,
    onOpenFullScreen,
    isFullScreen,
  } = actions;
  const canShowContextMenu = !!(
    onClearOutput ||
    onCopyOutput ||
    onHideOutput ||
    onMentionOutput ||
    onGoToSource ||
    onToggleOutputAppView
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const plotNodeRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<PlotlyLike | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const removePlotlyListenersRef = useRef<(() => void) | null>(null);
  const removeHoverLabelStylingRef = useRef<(() => void) | null>(null);
  const renderEpochRef = useRef(0);
  const hasRenderedRef = useRef(false);
  const figure = useMemo(() => parsePlotlyFigure(value), [value]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const figureLayout = figure.layout as Record<string, unknown> | undefined;
  const frameHeight = useMemo(() => {
    if (isFullScreen) {
      return Math.max(
        resolvePlotHeight(figureLayout?.height),
        720,
      );
    }
    return resolvePlotHeight(figureLayout?.height);
  }, [figureLayout?.height, isFullScreen]);
  const frameWidth = useMemo(() => {
    if (!isFullScreen) {
      return null;
    }
    const resolved = resolvePlotWidth(figureLayout?.width);
    if (resolved === null) {
      return null;
    }
    if (typeof window === "undefined") {
      return resolved;
    }
    return Math.min(resolved, window.innerWidth * 0.95);
  }, [figureLayout?.width, isFullScreen]);

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
        removeHoverLabelStylingRef.current?.();
        removeHoverLabelStylingRef.current = null;

        const figureLayout = (figure.layout ?? {}) as Record<string, unknown>;
        const figureFont =
          typeof figureLayout.font === "object" && figureLayout.font !== null
            ? (figureLayout.font as Record<string, unknown>)
            : {};
        const figureHoverLabel =
          typeof figureLayout.hoverlabel === "object" &&
            figureLayout.hoverlabel !== null
            ? (figureLayout.hoverlabel as Record<string, unknown>)
            : undefined;
        const colorTheme = theme === "dark" ? "dark" : "light";
        const shellStyles = resolveEditorToolbarShellStyles(colorTheme);

        const layout: Record<string, unknown> = {
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          ...figureLayout,
          font: {
            ...figureFont,
            family: resolveOrionSansFontFamily(),
            color: theme === "dark" ? "#ffffff" : "#000000",
          },
          hoverlabel: buildOrionHoverLabel(figureHoverLabel, shellStyles),
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
        removeHoverLabelStylingRef.current = attachPlotlyHoverLabelStyling(
          node,
          colorTheme,
        );
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
      removeHoverLabelStylingRef.current?.();
      removeHoverLabelStylingRef.current = null;
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
      removeHoverLabelStylingRef.current?.();
      removeHoverLabelStylingRef.current = null;
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
      className={
        isFullScreen
          ? frameWidth !== null
            ? "w-fit max-w-[95vw]"
            : "w-[95vw] max-w-[95vw]"
          : "w-full"
      }
      style={{
        minHeight: `${frameHeight}px`,
        ...(frameWidth !== null ? { width: frameWidth } : {}),
      }}
    >
      <div
        ref={plotNodeRef}
        className="orion-plotly-output w-full"
        style={{ minHeight: `${frameHeight}px` }}
      />
    </div>
  );

  if (!canShowContextMenu || isFullScreen) {
    return plotHost;
  }

  return (
    <OutputContextMenu
      cellIndex={cellIndex}
      outputIndex={outputIndex}
      onClearOutput={onClearOutput}
      onCopyOutput={onCopyOutput}
      onHideOutput={onHideOutput}
      onMentionOutput={onMentionOutput}
      onGoToSource={onGoToSource}
      onToggleAppView={onToggleOutputAppView}
      isInAppView={!!isInAppView}
      businessMode={businessMode}
      onOpenFullScreen={onOpenFullScreen}
      presentationMenu={actions.presentationMenu ?? undefined}
    >
      {plotHost}
    </OutputContextMenu>
  );
}
