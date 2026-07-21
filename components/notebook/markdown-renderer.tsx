"use client";

import MarkdownPreview, { type MarkdownPreviewProps } from "@uiw/react-markdown-preview";
import "@uiw/react-markdown-preview/markdown.css";
import "katex/dist/katex.css";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import {
  normalizeMarkdownMathSource,
  remarkMathJaxDelimiters,
} from "@/lib/markdown/math-delimiters";
import {
  isInternalNotebookAnchor,
  openNotebookLinkExternally,
  shouldOpenNotebookLinkExternally,
} from "@/lib/markdown/notebook-links";

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

const notebookMarkdownComponents: NonNullable<MarkdownPreviewProps["components"]> = {
  a({ href, children, ...props }) {
    if (shouldOpenNotebookLinkExternally(href)) {
      return (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault();
            openNotebookLinkExternally(href);
          }}
        >
          {children}
        </a>
      );
    }

    return (
      <a {...props} href={href} target={isInternalNotebookAnchor(href) ? undefined : props.target}>
        {children}
      </a>
    );
  },
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
        components={notebookMarkdownComponents}
        style={{ ...defaultMarkdownStyle, ...style }}
      />
    </div>
  );
}
