"use client";

import { Children, type ReactNode } from "react";

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
import { scopeCssToNotebook } from "@/lib/notebook/scoped-html-styles";

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
};

/** Converts a parsed style element's primitive children back into CSS text. */
function getStyleText(children: ReactNode): string {
  return Children.toArray(children)
    .filter((child): child is string | number =>
      typeof child === "string" || typeof child === "number"
    )
    .join("");
}

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
  style({ children, node: _node, ...props }) {
    return (
      <style {...props} data-orion-style-scoped="notebook-editor">
        {scopeCssToNotebook(getStyleText(children))}
      </style>
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
