"use client";

import MarkdownPreview from "@uiw/react-markdown-preview";
import "@uiw/react-markdown-preview/markdown.css";
import "katex/dist/katex.css";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface MarkdownRendererProps {
  source: string;
  style?: React.CSSProperties;
}

/**
 * Renders markdown content using @uiw/react-markdown-preview for full HTML and GFM support.
 *
 * @param source - The markdown string to be rendered
 * @returns A React component that renders the formatted markdown
 */
export function MarkdownRenderer({
  source,
  style = { backgroundColor: "transparent" },
}: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <MarkdownPreview
        source={source}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        style={style}
      />
    </div>
  );
}
