"use client";

import type { JSX } from "react";
import { ERROR_MIME, STREAM_MIME } from "@/lib/notebook/mime-registry";
import { DataResourceOutputRenderer } from "./dataresource";
import { ErrorOutputRenderer } from "./error";
import { GeoJsonOutputRenderer } from "./geojson";
import { HtmlOutputRenderer } from "./html";
import { ImageOutputRenderer } from "./image";
import { JavaScriptOutputRenderer } from "./javascript";
import { JsonOutputRenderer } from "./json";
import { LatexOutputRenderer } from "./latex";
import { MarkdownOutputRenderer } from "./markdown";
import { NteractModelDebugOutputRenderer } from "./nteract-model-debug";
import { PdfOutputRenderer } from "./pdf";
import { PlainTextOutputRenderer } from "./plain";
import { PlotlyHtmlOutputRenderer } from "./plotly-html";
import { PlotlyJsonOutputRenderer } from "./plotly-json";
import { StreamOutputRenderer } from "./stream";
import { SvgOutputRenderer } from "./svg";
import { VDomOutputRenderer } from "./vdom";
import { VegaOutputRenderer } from "./vega";
import { WidgetViewOutputRenderer } from "./widget-view";
import type { NotebookMimeRendererProps } from "./types";

export type NotebookMimeRenderer = (props: NotebookMimeRendererProps) => JSX.Element;

/** MIME -> UI renderer mapping used by OutputRenderer. */
export const MIME_RENDERERS: Record<string, NotebookMimeRenderer> = {
  [STREAM_MIME]: StreamOutputRenderer,
  [ERROR_MIME]: ErrorOutputRenderer,
  "application/vnd.plotly.v1+json": PlotlyJsonOutputRenderer,
  "text/vnd.plotly.v1+html": PlotlyHtmlOutputRenderer,
  "image/png": ImageOutputRenderer,
  "image/jpeg": ImageOutputRenderer,
  "image/gif": ImageOutputRenderer,
  "image/webp": ImageOutputRenderer,
  "image/svg+xml": SvgOutputRenderer,
  "application/javascript": JavaScriptOutputRenderer,
  "application/pdf": PdfOutputRenderer,
  "text/html": HtmlOutputRenderer,
  "text/latex": LatexOutputRenderer,
  "text/markdown": MarkdownOutputRenderer,
  "application/json": JsonOutputRenderer,
  "application/geo+json": GeoJsonOutputRenderer,
  "application/vdom.v1+json": VDomOutputRenderer,
  "application/vnd.dataresource+json": DataResourceOutputRenderer,
  "application/vnd.vega.v2+json": VegaOutputRenderer,
  "application/vnd.vega.v3+json": VegaOutputRenderer,
  "application/vnd.vega.v4+json": VegaOutputRenderer,
  "application/vnd.vega.v5+json": VegaOutputRenderer,
  "application/vnd.vegalite.v1+json": VegaOutputRenderer,
  "application/vnd.vegalite.v2+json": VegaOutputRenderer,
  "application/vnd.vegalite.v3+json": VegaOutputRenderer,
  "application/vnd.vegalite.v4+json": VegaOutputRenderer,
  "application/vnd.vegalite.v5+json": VegaOutputRenderer,
  "application/vnd.jupyter.widget-view+json": WidgetViewOutputRenderer,
  "application/x-nteract-model-debug+json": NteractModelDebugOutputRenderer,
  "text/plain": PlainTextOutputRenderer,
};
