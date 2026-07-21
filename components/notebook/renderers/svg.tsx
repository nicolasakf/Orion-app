"use client";

import type { JSX } from "react";
import { NotebookRenderedHtmlShell } from "@/components/notebook/notebook-rendered-html-shell";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render inline SVG image outputs.
 */
export function SvgOutputRenderer({
  value,
  sanitize,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  return (
    <NotebookRenderedHtmlShell
      className={
        actions.isFullScreen
          ? "max-w-[95vw] max-h-[95vh] w-fit overflow-auto"
          : "max-w-full overflow-x-auto"
      }
      html={sanitize(toJoinedString(value))}
    />
  );
}
