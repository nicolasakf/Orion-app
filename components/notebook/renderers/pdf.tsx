"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render base64 PDF MIME output in the browser's built-in PDF viewer.
 */
export function PdfOutputRenderer({
  value,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const data = toJoinedString(value).replace(/\s/g, "");

  return (
    <iframe
      className={
        actions.isFullScreen
          ? "w-full min-h-[85vh] rounded-md border"
          : "w-full min-h-[480px] rounded-md border"
      }
      src={`data:application/pdf;base64,${data}`}
      title="PDF output"
    />
  );
}
