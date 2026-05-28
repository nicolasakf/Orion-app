"use client";

import type { JSX } from "react";
import { extractTableFromHTML, isEmptyDataframeHtmlTable } from "@/lib/notebook/table-extractor";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render HTML outputs, preserving table HTML and handling empty DataFrame shells.
 */
export function HtmlOutputRenderer({
  output,
  value,
  sanitize,
  ansiConverter,
}: NotebookMimeRendererProps): JSX.Element {
  const html = toJoinedString(value);
  const tableData = extractTableFromHTML(html);

  if (tableData.headers.length > 0 && tableData.rows.length > 0) {
    return (
      <div
        className="jp-RenderedHTMLCommon orion-rendered-html overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: sanitize(html) }}
      />
    );
  }

  const plainText = output.data?.["text/plain"];
  const plainTextJoined = plainText ? toJoinedString(plainText) : "";
  if (plainTextJoined && isEmptyDataframeHtmlTable(html, tableData)) {
    return (
      <pre
        className="whitespace-pre-wrap text-sm p-3 rounded-md"
        dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(plainTextJoined) }}
      />
    );
  }

  return (
    <div
      className="jp-RenderedHTMLCommon orion-rendered-html overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: sanitize(html) }}
    />
  );
}
