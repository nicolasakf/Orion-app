"use client";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

interface WidgetViewPayload {
  model_id?: string;
  version_major?: number;
  version_minor?: number;
}

interface WidgetStateBundle {
  version_major?: number;
  version_minor?: number;
  state?: Record<string, unknown>;
}

interface ParsedWidgetFallback {
  kind: "slider" | "text";
  widgetName: string;
  description?: string;
  value?: string | number | boolean;
}

function getWidgetStateBundle(
  notebookMetadata: Record<string, unknown> | undefined
): WidgetStateBundle | null {
  const widgets = notebookMetadata?.widgets;
  if (!widgets || typeof widgets !== "object" || Array.isArray(widgets)) {
    return null;
  }
  const bundle = (widgets as Record<string, unknown>)[
    "application/vnd.jupyter.widget-state+json"
  ];
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return null;
  }
  return bundle as WidgetStateBundle;
}

function parseWidgetFallback(plainText: string): ParsedWidgetFallback | null {
  const match = plainText.match(/^([A-Za-z][A-Za-z0-9_]+)\((.*)\)$/);
  if (!match) {
    return plainText ? { kind: "text", widgetName: "Widget", value: plainText } : null;
  }

  const [, widgetName, args] = match;
  const valueMatch = args.match(/(?:^|,\s*)value=([^,)]*)/);
  const descriptionMatch = args.match(/(?:^|,\s*)description=(['"])(.*?)\1/);
  const rawValue = valueMatch?.[1]?.trim();
  const numericValue = rawValue === undefined ? Number.NaN : Number(rawValue);

  return {
    kind: /Slider$/.test(widgetName) ? "slider" : "text",
    widgetName,
    description: descriptionMatch?.[2],
    value: Number.isFinite(numericValue)
      ? numericValue
      : rawValue?.replace(/^['"]|['"]$/g, ""),
  };
}

function loadWidgetModule(moduleName: string): Promise<unknown> {
  if (moduleName === "@jupyter-widgets/base") {
    return import("@jupyter-widgets/base");
  }
  if (moduleName === "@jupyter-widgets/controls") {
    return import("@jupyter-widgets/controls");
  }
  if (moduleName === "@jupyter-widgets/output") {
    return import("@jupyter-widgets/output");
  }
  return Promise.reject(new Error(`Unsupported widget module: ${moduleName}`));
}

function StaticWidgetFallback({
  fallback,
  modelId,
}: {
  fallback: ParsedWidgetFallback | null;
  modelId?: string;
}): JSX.Element {
  const initialValue =
    typeof fallback?.value === "number" ? fallback.value : Number(fallback?.value ?? 0);
  const [sliderValue, setSliderValue] = useState(
    Number.isFinite(initialValue) ? initialValue : 0
  );

  if (fallback?.kind === "slider") {
    return (
      <div className="rounded-md border bg-muted/20 p-3 text-sm">
        <label className="flex flex-wrap items-center gap-3">
          <span className="min-w-20 font-medium">
            {fallback.description ?? fallback.widgetName}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={sliderValue}
            onChange={(event) => setSliderValue(Number(event.target.value))}
            className="min-w-48 flex-1"
          />
          <output className="w-12 text-right font-mono">{sliderValue}</output>
        </label>
        <div className="mt-2 text-xs text-muted-foreground">
          Static preview from the widget text fallback
          {modelId ? ` (${modelId})` : ""}.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="font-medium">{fallback?.widgetName ?? "Jupyter widget"}</div>
      {fallback?.value && <pre className="mt-2 whitespace-pre-wrap">{fallback.value}</pre>}
      <div className="mt-2 text-xs text-muted-foreground">
        No saved widget state was available for interactive hydration
        {modelId ? ` (${modelId})` : ""}.
      </div>
    </div>
  );
}

/**
 * Render a Jupyter widget-view output from saved widget state, with a static fallback.
 */
export function WidgetViewOutputRenderer({
  notebookMetadata,
  output,
  value,
}: NotebookMimeRendererProps): JSX.Element {
  const payload = (value ?? {}) as WidgetViewPayload;
  const plainText = toJoinedString(output.data?.["text/plain"]).trim();
  const fallback = useMemo(() => parseWidgetFallback(plainText), [plainText]);
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderState, setRenderState] = useState<"fallback" | "hydrating" | "hydrated">(
    "fallback"
  );
  const [renderError, setRenderError] = useState<string | null>(null);
  const widgetState = useMemo(
    () => getWidgetStateBundle(notebookMetadata),
    [notebookMetadata]
  );

  useEffect(() => {
    const host = hostRef.current;
    const modelId = payload.model_id;
    if (!host || !modelId || !widgetState?.state?.[modelId]) {
      setRenderState("fallback");
      return;
    }

    let isCancelled = false;
    let manager: { clear_state?: () => Promise<void> } | null = null;
    host.replaceChildren();
    setRenderState("hydrating");
    setRenderError(null);

    const render = async () => {
      try {
        const { HTMLManager } = await import("@jupyter-widgets/html-manager");
        const nextManager = new HTMLManager({ loader: loadWidgetModule });
        manager = nextManager;
        await nextManager.set_state(widgetState as never);
        const model = await nextManager.get_model(modelId);
        const view = await nextManager.create_view(model);
        await nextManager.display_view(view as never, host);
        if (!isCancelled) {
          setRenderState("hydrated");
        }
      } catch (error) {
        if (!isCancelled) {
          setRenderError(
            error instanceof Error ? error.message : "Unknown widget render error"
          );
          setRenderState("fallback");
        }
      }
    };

    void render();

    return () => {
      isCancelled = true;
      host.replaceChildren();
      void manager?.clear_state?.();
    };
  }, [payload.model_id, widgetState]);

  return (
    <>
      <div ref={hostRef} className={renderState === "hydrated" ? "rounded-md border p-3" : ""} />
      {renderState !== "hydrated" && (
        <div className={renderState === "hydrating" ? "mt-2 opacity-60" : ""}>
          {renderError && (
            <div className="mb-2 rounded-md border border-destructive/30 p-2 text-sm text-destructive">
              Error rendering widget state: {renderError}
            </div>
          )}
          <StaticWidgetFallback fallback={fallback} modelId={payload.model_id} />
        </div>
      )}
    </>
  );
}
