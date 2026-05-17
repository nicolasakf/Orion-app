"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render stdout/stderr stream outputs with ANSI color support.
 */
export function StreamOutputRenderer({
  output,
  value,
  ansiConverter,
}: NotebookMimeRendererProps): JSX.Element {
  const streamText = toJoinedString((value as { text?: string } | undefined)?.text ?? output.text);
  return (
    <pre
      className={`whitespace-pre-wrap text-sm p-3 ${output.name === "stderr" ? "text-red-400 text-xs" : "text-foreground"}`}
      dangerouslySetInnerHTML={{
        __html: ansiConverter.toHtml(streamText),
      }}
    />
  );
}
