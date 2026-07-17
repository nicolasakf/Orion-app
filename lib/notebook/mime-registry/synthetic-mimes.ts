import { OutputType, type NotebookOutputType } from "@/lib/types";

/** Synthetic MIME key used to route stream outputs through the registry. */
export const STREAM_MIME = "application/vnd.orion.stream";

/** Synthetic MIME key used to route error outputs through the registry. */
export const ERROR_MIME = "application/vnd.orion.error";

/** Synthetic MIME key used when no supported bundle entry is available. */
export const EMPTY_MIME = "application/vnd.orion.empty";

/** Synthetic MIME key used to route Plotly bootstrap HTML through the sandboxed chart renderer. */
export const PLOTLY_HTML_MIME = "application/vnd.orion.plotly+html";

/** Joins notebook MIME values that may be stored as Jupyter multiline strings. */
function toJoinedString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join("");
  }
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Detects Plotly's executable notebook bootstrap HTML without claiming ordinary HTML
 * that merely mentions Plotly. Both inline and CDN-backed Plotly renderers are covered.
 */
function isPlotlyBootstrapHtml(value: unknown): boolean {
  const html = toJoinedString(value);
  const scriptBlocks =
    html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];
  const hasPlotlyRenderer = scriptBlocks.some((script) =>
    /Plotly\.(?:newPlot|react)\s*\(/.test(script),
  );
  const hasPlotlyBootstrap = scriptBlocks.some(
    (script) =>
      /window\.PlotlyConfig/.test(script) ||
      /plotly(?:\.min)?\.js\s+v/i.test(script) ||
      /\bsrc=["'][^"']*plotly/i.test(script),
  );

  return hasPlotlyRenderer || hasPlotlyBootstrap;
}

/** Detects a Plotly HTML document that contains a concrete chart to render. */
function isPlotlyFigureHtml(value: unknown): boolean {
  const html = toJoinedString(value);
  const scriptBlocks =
    html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];
  return (
    /<div\b[^>]*\bid=["'][^"']+["'][^>]*>/i.test(html) &&
    scriptBlocks.some((script) =>
      /Plotly\.(?:newPlot|react)\s*\(/.test(script),
    )
  );
}

/**
 * Convert a notebook output into a MIME-like bundle map so all output types can
 * use the same MIME selection flow.
 */
export function getOutputMimeBundle(
  output: NotebookOutputType
): Record<string, unknown> {
  if (
    output.output_type === OutputType.EXECUTE_RESULT ||
    output.output_type === OutputType.DISPLAY_DATA
  ) {
    const bundle = (output.data ?? {}) as Record<string, unknown>;
    const html = bundle["text/html"];
    if (!isPlotlyBootstrapHtml(html)) {
      return bundle;
    }

    if (!isPlotlyFigureHtml(html)) {
      // Plotly's notebook renderer first emits a library loader with no chart.
      // It cannot produce visible output in Orion and is followed by the chart MIME.
      const { "text/html": _plotlyBootstrap, ...withoutBootstrap } = bundle;
      return withoutBootstrap;
    }

    return {
      ...bundle,
      [PLOTLY_HTML_MIME]: html,
    };
  }

  if (output.output_type === OutputType.STREAM) {
    return {
      [STREAM_MIME]: {
        name: output.name ?? "stdout",
        text: Array.isArray(output.text) ? output.text.join("") : (output.text ?? ""),
      },
    };
  }

  if (output.output_type === OutputType.ERROR) {
    return {
      [ERROR_MIME]: {
        ename: output.ename ?? "",
        evalue: output.evalue ?? "",
        traceback: output.traceback ?? [],
      },
    };
  }

  return { [EMPTY_MIME]: null };
}
