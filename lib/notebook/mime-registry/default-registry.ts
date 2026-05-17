import { OutputType } from "@/lib/types";
import { extractTableFromHTML, isEmptyDataframeHtmlTable } from "@/lib/notebook/table-extractor";
import { NotebookMimeRegistry } from "./registry";
import { ERROR_MIME, STREAM_MIME } from "./synthetic-mimes";
import type { MimeAgentResult, MimeModel, MimeOutputKind, MimeRendererFactory } from "./types";

const RASTER_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

const VEGA_MIME_TYPES = [
  "application/vnd.vega.v2+json",
  "application/vnd.vega.v3+json",
  "application/vnd.vega.v4+json",
  "application/vnd.vega.v5+json",
] as const;

const VEGALITE_MIME_TYPES = [
  "application/vnd.vegalite.v1+json",
  "application/vnd.vegalite.v2+json",
  "application/vnd.vegalite.v3+json",
  "application/vnd.vegalite.v4+json",
  "application/vnd.vegalite.v5+json",
] as const;

let defaultRegistry: NotebookMimeRegistry | null = null;

/**
 * Convert a mime value that may be a list of lines into a single string.
 */
function toJoinedString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join("");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

/**
 * Extract text/plain from a display-data bundle when available.
 */
function extractPlainTextFromDisplayData(model: MimeModel): string | null {
  const data = model.output.data ?? {};
  const plain = data["text/plain"];
  if (!plain) {
    return null;
  }
  return toJoinedString(plain);
}

/**
 * Build TSV content for table-like HTML summaries.
 */
function formatTSV(headers: string[], rows: string[][]): string {
  const header = headers.join("\t");
  const body = rows.map((row) => row.map((value) => value.replace(/\t/g, " ")).join("\t"));
  return [header, ...body].join("\n");
}

/**
 * Classify HTML payload as table or generic HTML.
 */
function classifyHtml(value: unknown): MimeOutputKind {
  const html = toJoinedString(value);
  if (typeof DOMParser === "undefined") {
    return html.includes("<table") ? "table" : "html";
  }
  const tableData = extractTableFromHTML(html);
  if (tableData.headers.length > 0 && tableData.rows.length > 0) {
    return "table";
  }
  return "html";
}

/**
 * Build text summary for text/html outputs.
 */
function summarizeHtml(model: MimeModel): string {
  const html = toJoinedString(model.value);
  const canParseTable = typeof DOMParser !== "undefined";
  const tableData = canParseTable
    ? extractTableFromHTML(html)
    : { headers: [] as string[], rows: [] as Array<Record<string, string>> };
  if (tableData.headers.length > 0 && tableData.rows.length > 0) {
    const tsv = formatTSV(
      tableData.headers,
      tableData.rows.map((row) => tableData.headers.map((header) => row[header] ?? ""))
    );
    return `[DataFrame / Table]\n${tsv}`;
  }

  const plainText = extractPlainTextFromDisplayData(model);
  if (plainText && canParseTable && isEmptyDataframeHtmlTable(html, tableData)) {
    return plainText;
  }

  const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return `[HTML]\n${stripped}`;
}

/**
 * Compute plain text length used for auto-collapse.
 */
function textLengthForTextValue(value: unknown): number {
  return toJoinedString(value).length;
}

function stringifyJsonValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function countGeoJsonFeatures(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }
  const payload = value as Record<string, unknown>;
  if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return payload.features.length;
  }
  return payload.type === "Feature" ? 1 : 0;
}

function summarizeVegaSpec(label: string, value: unknown): string {
  const spec = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const lines = [`[${label}]`];
  if (typeof spec.description === "string") {
    lines.push(`Description: ${spec.description}`);
  }
  if (typeof spec.width === "number" || typeof spec.height === "number") {
    lines.push(`Size: ${spec.width ?? "auto"} x ${spec.height ?? "auto"}`);
  }
  if (Array.isArray(spec.data)) {
    lines.push(`Data sources: ${spec.data.length}`);
  } else if (spec.data && typeof spec.data === "object") {
    lines.push("Data sources: 1");
  }
  if (Array.isArray(spec.marks)) {
    lines.push(`Marks: ${spec.marks.length}`);
  }
  return lines.join("\n");
}

/**
 * Build a concise text summary of a Plotly figure.
 */
export function summarizePlotlyFigure(plotlyData: unknown): string {
  let figure: Record<string, unknown>;
  try {
    figure =
      typeof plotlyData === "string"
        ? JSON.parse(plotlyData)
        : (plotlyData as Record<string, unknown>);
  } catch {
    return "[Plotly chart — could not parse JSON]";
  }

  const lines: string[] = ["[Plotly Chart]"];
  const layout = (figure.layout ?? {}) as Record<string, unknown>;
  const traces = (figure.data ?? []) as Array<Record<string, unknown>>;

  const title = (layout.title as Record<string, unknown>)?.text ?? layout.title;
  if (title && typeof title === "string") {
    lines.push(`Title: ${title}`);
  }

  const xaxis = layout.xaxis as Record<string, unknown> | undefined;
  const yaxis = layout.yaxis as Record<string, unknown> | undefined;
  if (xaxis?.title) {
    const xTitle =
      typeof xaxis.title === "string"
        ? xaxis.title
        : (xaxis.title as Record<string, unknown>)?.text;
    if (xTitle) {
      lines.push(`X axis: ${xTitle}`);
    }
  }
  if (yaxis?.title) {
    const yTitle =
      typeof yaxis.title === "string"
        ? yaxis.title
        : (yaxis.title as Record<string, unknown>)?.text;
    if (yTitle) {
      lines.push(`Y axis: ${yTitle}`);
    }
  }

  lines.push(`Traces: ${traces.length}`);
  for (let i = 0; i < Math.min(traces.length, 5); i++) {
    const trace = traces[i];
    const traceType = (trace.type as string) ?? "scatter";
    const traceName = (trace.name as string) ?? `trace ${i}`;
    const xLen = Array.isArray(trace.x) ? trace.x.length : null;
    const yLen = Array.isArray(trace.y) ? trace.y.length : null;
    const pointsInfo =
      xLen !== null ? ` (${xLen} points)` : yLen !== null ? ` (${yLen} points)` : "";
    lines.push(`  [${i}] ${traceType} — "${traceName}"${pointsInfo}`);

    const traceX = trace.x as unknown[];
    const traceY = trace.y as unknown[];
    if (Array.isArray(traceX) && Array.isArray(traceY) && traceX.length > 0) {
      const sampleSize = Math.min(3, traceX.length);
      const sample = Array.from(
        { length: sampleSize },
        (_, j) => `(${traceX[j]}, ${traceY[j]})`
      ).join(", ");
      lines.push(`       Sample: ${sample}`);
    }
  }
  if (traces.length > 5) {
    lines.push(`  ... and ${traces.length - 5} more traces`);
  }

  return lines.join("\n");
}

/**
 * Build the default list of MIME renderer factories used across the notebook.
 */
function buildDefaultFactories(): MimeRendererFactory[] {
  return [
    {
      id: "orion-stream",
      mimeTypes: [STREAM_MIME],
      rank: 1,
      safe: true,
      kind: "stream",
      collapsible: true,
      outputTypes: [OutputType.STREAM],
      summarize: (model) => {
        const payload = model.value as { name?: string; text?: string };
        return `[${payload?.name ?? "stdout"}]\n${payload?.text ?? ""}`;
      },
      toAgentResult: (model): MimeAgentResult => ({
        text: `[${(model.value as { name?: string })?.name ?? "stdout"}]\n${(model.value as { text?: string })?.text ?? ""}`,
      }),
      textLength: (model) => textLengthForTextValue((model.value as { text?: string })?.text),
      toClipboard: (model) => ({
        kind: "text",
        text: (model.value as { text?: string })?.text ?? "",
      }),
    },
    {
      id: "orion-error",
      mimeTypes: [ERROR_MIME],
      rank: 1,
      safe: true,
      kind: "error",
      collapsible: true,
      outputTypes: [OutputType.ERROR],
      summarize: (model) => {
        const payload = model.value as {
          ename?: string;
          evalue?: string;
          traceback?: string[];
        };
        const traceback = (payload.traceback ?? []).slice(-30).join("\n");
        return `[ERROR: ${payload.ename ?? ""}: ${payload.evalue ?? ""}]\n${traceback}`;
      },
      toAgentResult: (model): MimeAgentResult => {
        const payload = model.value as {
          ename?: string;
          evalue?: string;
          traceback?: string[];
        };
        return {
          text: `[ERROR: ${payload.ename ?? ""}: ${payload.evalue ?? ""}]\n${(payload.traceback ?? []).join("\n")}`,
        };
      },
      textLength: (model) => {
        const payload = model.value as {
          ename?: string;
          evalue?: string;
          traceback?: string[];
        };
        const header = `${payload.ename ?? ""}: ${payload.evalue ?? ""}`;
        const traceback = (payload.traceback ?? []).join("\n");
        return header.length + traceback.length;
      },
      toClipboard: (model) => {
        const payload = model.value as {
          ename?: string;
          evalue?: string;
          traceback?: string[];
        };
        const traceback = (payload.traceback ?? []).join("\n");
        return {
          kind: "text",
          text: `${payload.ename ?? ""}: ${payload.evalue ?? ""}${traceback ? `\n${traceback}` : ""}`,
        };
      },
    },
    {
      id: "orion-plotly-json",
      mimeTypes: ["application/vnd.plotly.v1+json"],
      rank: 5,
      safe: true,
      kind: "plotly",
      disableContextMenu: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => summarizePlotlyFigure(model.value),
      toAgentResult: (model) => ({
        text: summarizePlotlyFigure(model.value),
      }),
      textLength: () => 0,
      toClipboard: (model) => ({
        kind: "text",
        text: JSON.stringify(
          typeof model.value === "string" ? JSON.parse(model.value) : model.value,
          null,
          2
        ),
      }),
    },
    {
      id: "orion-plotly-html",
      mimeTypes: ["text/vnd.plotly.v1+html"],
      rank: 6,
      safe: false,
      kind: "plotly",
      disableContextMenu: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[Plotly HTML]\n${toJoinedString(model.value)}`,
      toAgentResult: (model) => ({
        text: `[Plotly HTML]\n${toJoinedString(model.value)}`,
      }),
      textLength: () => 0,
      toClipboard: (model) => ({
        kind: "text",
        text: toJoinedString(model.value),
      }),
    },
    ...RASTER_IMAGE_MIME_TYPES.map<MimeRendererFactory>((mimeType) => ({
      id: `orion-${mimeType.replace("/", "-")}`,
      mimeTypes: [mimeType],
      rank: 10,
      safe: true,
      kind: "image",
      disableContextMenu: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: () => `[Image: ${mimeType}]`,
      toAgentResult: (model) => {
        const rawData = toJoinedString(model.value);
        const plain = extractPlainTextFromDisplayData(model);
        return {
          text: plain ? `[Image: ${mimeType}]\n${plain}` : `[Image: ${mimeType}]`,
          images: [{ mimeType, data: rawData }],
        };
      },
      textLength: () => 0,
      toClipboard: (model) => ({
        kind: "image",
        mimeType,
        data: toJoinedString(model.value).replace(/\s/g, ""),
      }),
    })),
    {
      id: "orion-svg",
      mimeTypes: ["image/svg+xml"],
      rank: 11,
      safe: true,
      kind: "image",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[SVG]\n${toJoinedString(model.value)}`,
      toAgentResult: (model) => ({ text: `[SVG]\n${toJoinedString(model.value)}` }),
      textLength: () => 0,
      toClipboard: (model) => ({ kind: "text", text: toJoinedString(model.value) }),
    },
    {
      id: "orion-html",
      mimeTypes: ["text/html"],
      rank: 20,
      safe: false,
      kind: "html",
      collapsible: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      classify: (model) => classifyHtml(model.value),
      summarize: (model) => summarizeHtml(model),
      toAgentResult: (model) => ({ text: summarizeHtml(model) }),
      textLength: (model) => {
        if (classifyHtml(model.value) === "table") {
          return 0;
        }
        return toJoinedString(model.value).length;
      },
      toClipboard: (model) => ({ kind: "text", text: toJoinedString(model.value) }),
    },
    {
      id: "orion-javascript",
      mimeTypes: ["application/javascript"],
      rank: 25,
      safe: false,
      kind: "html",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[JavaScript]\n${toJoinedString(model.value)}`,
      toAgentResult: (model) => ({
        text: `[JavaScript]\n${toJoinedString(model.value)}`,
      }),
      textLength: (model) => textLengthForTextValue(model.value),
      toClipboard: (model) => ({ kind: "text", text: toJoinedString(model.value) }),
    },
    {
      id: "orion-markdown",
      mimeTypes: ["text/markdown"],
      rank: 30,
      safe: true,
      kind: "text",
      collapsible: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[Markdown]\n${toJoinedString(model.value)}`,
      toAgentResult: (model) => ({ text: `[Markdown]\n${toJoinedString(model.value)}` }),
      textLength: (model) => textLengthForTextValue(model.value),
      toClipboard: (model) => ({ kind: "text", text: toJoinedString(model.value) }),
    },
    {
      id: "orion-latex",
      mimeTypes: ["text/latex"],
      rank: 31,
      safe: true,
      kind: "text",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[LaTeX]\n${toJoinedString(model.value)}`,
      toAgentResult: (model) => ({ text: `[LaTeX]\n${toJoinedString(model.value)}` }),
      textLength: (model) => textLengthForTextValue(model.value),
      toClipboard: (model) => ({ kind: "text", text: toJoinedString(model.value) }),
    },
    {
      id: "orion-pdf",
      mimeTypes: ["application/pdf"],
      rank: 32,
      safe: true,
      kind: "text",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: () => "[PDF document]",
      toAgentResult: (model) => {
        const plain = extractPlainTextFromDisplayData(model);
        return { text: plain ? `[PDF document]\n${plain}` : "[PDF document]" };
      },
      textLength: () => 0,
      toClipboard: (model) => ({
        kind: "text",
        text: toJoinedString(model.value).replace(/\s/g, ""),
      }),
    },
    {
      id: "orion-geojson",
      mimeTypes: ["application/geo+json"],
      rank: 33,
      safe: true,
      kind: "image",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) =>
        `[GeoJSON]\nFeatures: ${countGeoJsonFeatures(model.value)}\n${stringifyJsonValue(model.value)}`,
      toAgentResult: (model) => ({
        text: `[GeoJSON]\nFeatures: ${countGeoJsonFeatures(model.value)}\n${stringifyJsonValue(model.value)}`,
      }),
      textLength: () => 0,
      toClipboard: (model) => ({ kind: "text", text: stringifyJsonValue(model.value) }),
    },
    {
      id: "orion-vdom",
      mimeTypes: ["application/vdom.v1+json"],
      rank: 34,
      safe: true,
      kind: "html",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[VDOM]\n${stringifyJsonValue(model.value)}`,
      toAgentResult: (model) => ({ text: `[VDOM]\n${stringifyJsonValue(model.value)}` }),
      textLength: () => 0,
      toClipboard: (model) => ({ kind: "text", text: stringifyJsonValue(model.value) }),
    },
    {
      id: "orion-dataresource",
      mimeTypes: ["application/vnd.dataresource+json"],
      rank: 34,
      safe: true,
      kind: "table",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[Data Resource]\n${stringifyJsonValue(model.value)}`,
      toAgentResult: (model) => ({
        text: `[Data Resource]\n${stringifyJsonValue(model.value)}`,
      }),
      textLength: () => 0,
      toClipboard: (model) => ({ kind: "text", text: stringifyJsonValue(model.value) }),
    },
    {
      id: "orion-vega",
      mimeTypes: [...VEGA_MIME_TYPES],
      rank: 34,
      safe: true,
      kind: "html",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => summarizeVegaSpec("Vega chart", model.value),
      toAgentResult: (model) => ({ text: summarizeVegaSpec("Vega chart", model.value) }),
      textLength: () => 0,
      toClipboard: (model) => ({ kind: "text", text: stringifyJsonValue(model.value) }),
    },
    {
      id: "orion-vegalite",
      mimeTypes: [...VEGALITE_MIME_TYPES],
      rank: 34,
      safe: true,
      kind: "html",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => summarizeVegaSpec("Vega-Lite chart", model.value),
      toAgentResult: (model) => ({
        text: summarizeVegaSpec("Vega-Lite chart", model.value),
      }),
      textLength: () => 0,
      toClipboard: (model) => ({ kind: "text", text: stringifyJsonValue(model.value) }),
    },
    {
      id: "orion-widget-view",
      mimeTypes: ["application/vnd.jupyter.widget-view+json"],
      rank: 34,
      safe: true,
      kind: "html",
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => {
        const plain = extractPlainTextFromDisplayData(model);
        return plain
          ? `[Jupyter widget]\n${plain}\n${stringifyJsonValue(model.value)}`
          : `[Jupyter widget]\n${stringifyJsonValue(model.value)}`;
      },
      toAgentResult: (model) => {
        const plain = extractPlainTextFromDisplayData(model);
        return {
          text: plain
            ? `[Jupyter widget]\n${plain}\n${stringifyJsonValue(model.value)}`
            : `[Jupyter widget]\n${stringifyJsonValue(model.value)}`,
        };
      },
      textLength: () => 0,
      toClipboard: (model) => ({ kind: "text", text: stringifyJsonValue(model.value) }),
    },
    {
      id: "orion-nteract-model-debug",
      mimeTypes: ["application/x-nteract-model-debug+json"],
      rank: 34,
      safe: true,
      kind: "text",
      collapsible: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[nteract model debug]\n${stringifyJsonValue(model.value)}`,
      toAgentResult: (model) => ({
        text: `[nteract model debug]\n${stringifyJsonValue(model.value)}`,
      }),
      textLength: (model) => stringifyJsonValue(model.value).length,
      toClipboard: (model) => ({ kind: "text", text: stringifyJsonValue(model.value) }),
    },
    {
      id: "orion-json",
      mimeTypes: ["application/json"],
      rank: 35,
      safe: true,
      kind: "text",
      collapsible: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => `[JSON]\n${stringifyJsonValue(model.value)}`,
      toAgentResult: (model) => ({ text: `[JSON]\n${stringifyJsonValue(model.value)}` }),
      textLength: (model) => stringifyJsonValue(model.value).length,
      toClipboard: (model) => ({
        kind: "text",
        text: stringifyJsonValue(model.value),
      }),
    },
    {
      id: "orion-plain-text",
      mimeTypes: ["text/plain"],
      rank: 40,
      safe: true,
      kind: "text",
      collapsible: true,
      outputTypes: [OutputType.EXECUTE_RESULT, OutputType.DISPLAY_DATA],
      summarize: (model) => toJoinedString(model.value),
      toAgentResult: (model) => ({ text: toJoinedString(model.value) }),
      textLength: (model) => textLengthForTextValue(model.value),
      toClipboard: (model) => ({ kind: "text", text: toJoinedString(model.value) }),
    },
  ];
}

/**
 * Create a fully populated MIME registry for notebook outputs.
 */
export function createDefaultMimeRegistry(): NotebookMimeRegistry {
  const registry = new NotebookMimeRegistry();
  for (const factory of buildDefaultFactories()) {
    registry.addFactory(factory);
  }
  return registry;
}

/**
 * Shared singleton used by notebook UI, copy handlers, minimap, and tools.
 */
export function getDefaultMimeRegistry(): NotebookMimeRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultMimeRegistry();
  }
  return defaultRegistry;
}
