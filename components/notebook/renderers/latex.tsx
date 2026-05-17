"use client";

import type { JSX } from "react";
import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render LaTeX MIME output through the notebook markdown math pipeline.
 */
export function LatexOutputRenderer({
  value,
}: NotebookMimeRendererProps): JSX.Element {
  const latex = toJoinedString(value).trim();

  return (
    <div className="p-3 overflow-x-auto">
      <MarkdownRenderer source={`$$\n${latex}\n$$`} />
    </div>
  );
}
