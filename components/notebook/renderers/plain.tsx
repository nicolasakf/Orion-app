"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render plain text output with ANSI colors converted to HTML spans.
 */
export function PlainTextOutputRenderer({
  value,
  ansiConverter,
}: NotebookMimeRendererProps): JSX.Element {
  return (
    <pre
      className="whitespace-pre-wrap text-sm p-3 rounded-md"
      dangerouslySetInnerHTML={{
        __html: ansiConverter.toHtml(toJoinedString(value)),
      }}
    />
  );
}
