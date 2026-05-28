"use client";

import MarkdownPreview from "@uiw/react-markdown-preview";
import "@uiw/react-markdown-preview/markdown.css";
import "katex/dist/katex.css";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import {
  normalizeMarkdownMathSource,
  remarkMathJaxDelimiters,
} from "@/lib/markdown/math-delimiters";

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
const defaultMarkdownStyle: React.CSSProperties = {
  backgroundColor: "transparent",
  fontFamily: "var(--font-sans), sans-serif",
};

export function MarkdownRenderer({
  source,
  style,
}: MarkdownRendererProps) {
  return (
    <div className="jp-MarkdownOutput jp-RenderedHTMLCommon prose prose-sm max-w-none font-sans dark:prose-invert">
      <MarkdownPreview
        source={normalizeMarkdownMathSource(source)}
        remarkPlugins={[remarkMath, remarkMathJaxDelimiters]}
        rehypePlugins={[rehypeKatex]}
        style={{ ...defaultMarkdownStyle, ...style }}
      />
    </div>
  );
}
