"use client";

import type { JSX } from "react";
import { extractTableFromHTML, isEmptyDataframeHtmlTable } from "@/lib/notebook/table-extractor";
import { scopeHtmlStyleTags } from "@/lib/notebook/scoped-html-styles";
import { cn } from "@/lib/utils";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

function htmlOutputShellClassName(isFullScreen?: boolean): string {
  return cn(
    "jp-RenderedHTMLCommon orion-rendered-html",
    isFullScreen ? "orion-rendered-html--fullscreen" : "overflow-x-auto",
  );
}

/**
 * Render HTML outputs, preserving table HTML and handling empty DataFrame shells.
 */
export function HtmlOutputRenderer({
  output,
  value,
  sanitize,
  ansiConverter,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const html = toJoinedString(value);
  const safeHtml = scopeHtmlStyleTags(sanitize(html));
  const tableData = extractTableFromHTML(html);

  if (tableData.headers.length > 0 && tableData.rows.length > 0) {
    return (
      <div
        className={htmlOutputShellClassName(actions.isFullScreen)}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
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
      className={htmlOutputShellClassName(actions.isFullScreen)}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
