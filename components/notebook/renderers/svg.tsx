"use client";

import type { JSX } from "react";
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
    <div
      className={
        actions.isFullScreen
          ? "max-w-[95vw] max-h-[95vh] w-fit overflow-auto"
          : "max-w-full overflow-x-auto"
      }
      dangerouslySetInnerHTML={{ __html: sanitize(toJoinedString(value)) }}
    />
  );
}
