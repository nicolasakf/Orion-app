import { MIME_RENDERERS } from "@/components/notebook/renderers";
import { ERROR_MIME, STREAM_MIME } from "@/lib/notebook/mime-registry";
import type { NotebookMimeRegistry } from "@/lib/notebook/mime-registry";
import type { MimeOutputKind } from "@/lib/notebook/mime-registry";
import { getOutputMimeBundle } from "@/lib/notebook/mime-registry";
import type { NotebookOutputType } from "@/lib/types";

const MIME_LABEL_OVERRIDES: Record<string, string> = {
  "text/plain": "Plain text",
  "text/html": "HTML",
  "text/markdown": "Markdown",
  "image/png": "Image (PNG)",
  "image/jpeg": "Image (JPEG)",
  "image/gif": "Image (GIF)",
  "image/webp": "Image (WebP)",
  "image/svg+xml": "SVG",
  "application/javascript": "JavaScript",
  "application/json": "JSON",
  "application/pdf": "PDF",
  "application/geo+json": "GeoJSON",
  "application/vdom.v1+json": "VDOM",
  "application/vnd.dataresource+json": "Data Resource",
  "application/vnd.jupyter.widget-view+json": "Jupyter widget",
  "application/vnd.plotly.v1+json": "Plotly (interactive)",
  "application/vnd.vega.v2+json": "Vega v2",
  "application/vnd.vega.v3+json": "Vega v3",
  "application/vnd.vega.v4+json": "Vega v4",
  "application/vnd.vega.v5+json": "Vega v5",
  "application/vnd.vegalite.v1+json": "Vega-Lite v1",
  "application/vnd.vegalite.v2+json": "Vega-Lite v2",
  "application/vnd.vegalite.v3+json": "Vega-Lite v3",
  "application/vnd.vegalite.v4+json": "Vega-Lite v4",
  "application/vnd.vegalite.v5+json": "Vega-Lite v5",
  "application/x-nteract-model-debug+json": "nteract model debug",
  "text/latex": "LaTeX",
  "text/vnd.plotly.v1+html": "Plotly (HTML)",
  [STREAM_MIME]: "Text stream",
  [ERROR_MIME]: "Error",
};

/**
 * User-facing short label for a renderable output MIME in the presentation submenu.
 */
export function labelForOutputPresentation(
  mimeType: string,
  kind: MimeOutputKind
): string {
  const override = MIME_LABEL_OVERRIDES[mimeType];
  if (override) {
    return override;
  }
  if (kind === "image" && mimeType.startsWith("image/")) {
    return `Image (${mimeType.slice("image/".length).toUpperCase()})`;
  }
  if (mimeType.length > 48) {
    return `${mimeType.slice(0, 46)}…`;
  }
  return mimeType;
}

function hasUiRenderer(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_RENDERERS, mimeType);
}

export interface OutputPresentationOption {
  mimeType: string;
  label: string;
  rank: number;
}

/**
 * Lists every MIME in the output bundle that Orion can show with a built-in renderer
 * (used for the “Presentation” context submenu).
 */
export function getOutputPresentationMimes(
  registry: NotebookMimeRegistry,
  output: NotebookOutputType,
  trusted: boolean
): OutputPresentationOption[] {
  const bundle = getOutputMimeBundle(output);
  const mimes: OutputPresentationOption[] = [];
  for (const mimeType of Object.keys(bundle)) {
    if (bundle[mimeType] === undefined) {
      continue;
    }
    const resolved = registry.resolveForMimeType(output, mimeType, trusted);
    if (!resolved) {
      continue;
    }
    if (!hasUiRenderer(mimeType)) {
      continue;
    }
    mimes.push({
      mimeType,
      label: labelForOutputPresentation(mimeType, resolved.factory.kind),
      rank: resolved.factory.rank,
    });
  }
  mimes.sort(
    (a, b) => a.rank - b.rank || a.mimeType.localeCompare(b.mimeType)
  );
  return mimes;
}

/**
 * Resolves the MIME to show, honoring an override when it is still valid and renderable.
 */
export function resolveOutputForPresentation(
  registry: NotebookMimeRegistry,
  output: NotebookOutputType,
  trusted: boolean,
  overrideMime: string | null
) {
  if (overrideMime) {
    const chosen = registry.resolveForMimeType(output, overrideMime, trusted);
    if (chosen && hasUiRenderer(overrideMime)) {
      return chosen;
    }
  }
  return registry.resolve(output, trusted);
}
