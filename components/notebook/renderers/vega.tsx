"use client";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { VisualizationSpec } from "vega-embed";
import type { NotebookMimeRendererProps } from "./types";

interface VegaEmbedResult {
  finalize?: () => void;
}

type VegaEmbed = (
  el: HTMLElement,
  spec: VisualizationSpec,
  options?: Record<string, unknown>
) => Promise<VegaEmbedResult>;

/**
 * Render Vega and Vega-Lite MIME bundles with vega-embed.
 */
export function VegaOutputRenderer({
  mimeType,
  value,
  theme,
}: NotebookMimeRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const spec = useMemo(() => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as VisualizationSpec;
      } catch {
        return null;
      }
    }
    return (value ?? null) as VisualizationSpec | null;
  }, [value]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !spec) {
      return;
    }

    let isCancelled = false;
    let result: VegaEmbedResult | null = null;
    container.replaceChildren();

    const render = async () => {
      try {
        const mod = await import("vega-embed");
        const embed = (mod.default ?? mod) as VegaEmbed;
        result = await embed(container, spec, {
          actions: true,
          renderer: "canvas",
          theme: theme === "dark" ? "dark" : undefined,
        });
        if (!isCancelled) {
          setRenderError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setRenderError(
            error instanceof Error ? error.message : "Unknown Vega render error"
          );
        }
      }
    };

    void render();

    return () => {
      isCancelled = true;
      result?.finalize?.();
      container.replaceChildren();
    };
  }, [spec, theme]);

  if (!spec) {
    return (
      <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
        Invalid {mimeType} specification.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-md p-2">
      {renderError && (
        <div className="mb-2 rounded-md border border-destructive/30 p-2 text-sm text-destructive">
          Error rendering {mimeType}: {renderError}
        </div>
      )}
      <div ref={containerRef} className="min-h-24" />
    </div>
  );
}
