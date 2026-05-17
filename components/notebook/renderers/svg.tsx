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
}: NotebookMimeRendererProps): JSX.Element {
  return (
    <div
      className="max-w-full overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: sanitize(toJoinedString(value)) }}
    />
  );
}
