"use client";

import type { JSX } from "react";
import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render rich markdown output from notebook mime bundles.
 */
export function MarkdownOutputRenderer({
  value,
}: NotebookMimeRendererProps): JSX.Element {
  return (
    <div className="jp-OutputArea-output p-3">
      <MarkdownRenderer source={toJoinedString(value)} />
    </div>
  );
}
