"use client";

import * as React from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import { Maximize2 } from "lucide-react";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.css";

import { CHAT_MARKDOWN_TABLE_MAX_HEIGHT_CLASS, CodeBlock } from "@/components/right-sidebar/code-block";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollGradientOverlays, useScrollEdgeIndicators } from "@/components/right-sidebar/scroll-edge-gradient";
import { cn } from "@/lib/utils";

interface ChatMarkdownRendererProps {
  source: string;
  fontSize: number;
}

interface HastElement {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastElement[];
}

const allowedMarkdownElements = [
  "a",
  "annotation",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "kbd",
  "li",
  "mark",
  "math",
  "mfrac",
  "mi",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mroot",
  "mrow",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
  "ol",
  "p",
  "pre",
  "section",
  "semantics",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

/** Extract plain text from Markdown code children for CodeBlock rendering. */
function textFromChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  return "";
}

/** True when a link should navigate within the rendered chat document. */
function isInternalAnchor(href: string | undefined): href is `#${string}` {
  return typeof href === "string" && href.startsWith("#") && href.length > 1;
}

/** Escape an element id for querySelector in browsers with or without CSS.escape. */
function escapeElementId(id: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(id)
    : id.replace(/["\\]/g, "\\$&");
}

/** Normalize HAST className values into plain strings. */
function getClassName(properties: Record<string, unknown> | undefined): string {
  const className = properties?.className;
  if (Array.isArray(className)) return className.filter(Boolean).join(" ");
  return typeof className === "string" ? className : "";
}

/** Mark spans inside KaTeX so the React component can preserve layout styles. */
function markKatexSpans(node: HastElement, inKatex = false): void {
  if (!node || typeof node !== "object") return;

  const className = getClassName(node.properties);
  const isKatexRoot =
    node.tagName === "span" &&
    className
      .split(/\s+/)
      .some((name) => name === "katex" || name === "katex-display");
  const insideKatex = inKatex || isKatexRoot;

  if (insideKatex && node.tagName === "span") {
    node.properties = {
      ...node.properties,
      "data-orion-katex": "true",
    };
  }

  for (const child of node.children ?? []) {
    markKatexSpans(child, insideKatex);
  }
}

/** Rehype plugin that labels KaTeX spans after rehype-katex generates them. */
function rehypeMarkKatexSpans() {
  return (tree: HastElement) => {
    markKatexSpans(tree);
  };
}

/** Scroll same-message hash links without opening a new tab or hitting duplicate IDs. */
function handleInternalAnchorClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string | undefined
): void {
  if (!isInternalAnchor(href)) return;

  const anchorId = decodeURIComponent(href.slice(1));
  const root = event.currentTarget.closest("[data-chat-markdown-root]");
  const target = root?.querySelector<HTMLElement>(`#${escapeElementId(anchorId)}`);

  if (!target) return;

  event.preventDefault();
  target.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** GFM table with sidebar scroll fades (top fade omitted — sticky header). */
function ChatMarkdownTableShell({ children }: { children: React.ReactNode }) {
  const { scrollRef, scrollEdges } = useScrollEdgeIndicators();

  return (
    <Dialog>
      <div className="my-2 max-w-full">
        <div className="mb-1 flex justify-end">
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
              aria-label="Open table"
            >
              <Maximize2 />
            </Button>
          </DialogTrigger>
        </div>

        <div className="corner-squircle relative max-w-full overflow-hidden rounded-md border border-border">
          <div
            ref={scrollRef}
            className={cn(
              "scrollbar-hide max-w-full overflow-auto bg-sidebar",
              CHAT_MARKDOWN_TABLE_MAX_HEIGHT_CLASS
            )}
          >
            <table className="w-full border-separate border-spacing-0 text-xs">{children}</table>
          </div>
          <ScrollGradientOverlays edges={scrollEdges} show={{ top: false }} />
        </div>
      </div>

      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        className="w-fit max-w-[96vw] border-0 p-3"
      >
        <DialogTitle className="sr-only">Markdown table</DialogTitle>
        <div className="scrollbar-hide max-h-[88vh] max-w-[94vw] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">{children}</table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const markdownComponents: Components = {
  strong({ children }) {
    return <strong className="font-semibold">{children}</strong>;
  },
  em({ children }) {
    return <em>{children}</em>;
  },
  del({ children }) {
    return <del>{children}</del>;
  },
  p({ children }) {
    return <p className="my-1.5 leading-relaxed">{children}</p>;
  },
  h1({ children, id }) {
    return (
      <h1 id={id} className="mb-2 mt-3 scroll-mt-4 text-base font-semibold leading-snug">
        {children}
      </h1>
    );
  },
  h2({ children, id, className }) {
    if (className === "sr-only") {
      return (
        <h2 id={id} className="sr-only">
          {children}
        </h2>
      );
    }

    return (
      <h2 id={id} className="mb-2 mt-3 scroll-mt-4 text-sm font-semibold leading-snug">
        {children}
      </h2>
    );
  },
  h3({ children, id }) {
    return (
      <h3 id={id} className="mb-1.5 mt-2.5 scroll-mt-4 text-sm font-semibold leading-snug">
        {children}
      </h3>
    );
  },
  h4({ children, id }) {
    return (
      <h4 id={id} className="mb-1.5 mt-2 scroll-mt-4 text-xs font-semibold uppercase tracking-normal">
        {children}
      </h4>
    );
  },
  h5({ children, id }) {
    return (
      <h5 id={id} className="mb-1 mt-2 scroll-mt-4 text-xs font-semibold leading-snug">
        {children}
      </h5>
    );
  },
  h6({ children, id }) {
    return (
      <h6 id={id} className="mb-1 mt-2 scroll-mt-4 text-xs font-medium leading-snug text-muted-foreground">
        {children}
      </h6>
    );
  },
  ul({ children }) {
    return <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>;
  },
  li({ children, id }) {
    return <li id={id} className="scroll-mt-4 pl-0.5 leading-relaxed">{children}</li>;
  },
  input({ checked, type }) {
    if (type !== "checkbox") return null;

    return (
      <input
        type="checkbox"
        checked={checked}
        disabled
        readOnly
        className="mr-1 align-middle"
      />
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  a(props) {
    const {
      children,
      href,
      id,
      className,
      "aria-describedby": ariaDescribedBy,
      "aria-label": ariaLabel,
    } = props;
    const footnoteRef = (props as { "data-footnote-ref"?: boolean | string })["data-footnote-ref"];
    const footnoteBackref = (props as { "data-footnote-backref"?: boolean | string })["data-footnote-backref"];
    const internalAnchor = isInternalAnchor(href);

    return (
      <a
        id={id}
        href={href}
        target={internalAnchor ? undefined : "_blank"}
        rel={internalAnchor ? undefined : "noreferrer"}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        data-footnote-ref={footnoteRef}
        data-footnote-backref={footnoteBackref}
        onClick={(event) => handleInternalAnchorClick(event, href)}
        className={cn(
          "text-primary underline decoration-primary/40 underline-offset-2",
          className === "data-footnote-backref" && "ml-1 text-xs no-underline"
        )}
      >
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  code({ children, className }) {
    const code = textFromChildren(children).replace(/\n$/, "");
    const language = /language-(\S+)/.exec(className ?? "")?.[1];
    const isBlock = Boolean(language) || code.includes("\n");

    if (isBlock) {
      return <CodeBlock className="my-2" code={code} language={language ?? "text"} />;
    }

    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em] text-foreground">
        {children}
      </code>
    );
  },
  span(props) {
    const {
      children,
      className,
      "aria-hidden": ariaHidden,
      style,
    } = props;
    const dataOrionKatex = (props as { "data-orion-katex"?: string })["data-orion-katex"];
    const safeStyle = dataOrionKatex === "true" ? style : undefined;

    return (
      <span className={className} aria-hidden={ariaHidden} style={safeStyle}>
        {children}
      </span>
    );
  },
  img({ alt, src, title }) {
    if (!src) return null;

    return (
      <img
        alt={alt ?? ""}
        src={src}
        title={title}
        className="my-2 max-w-full rounded-md border border-border"
        loading="lazy"
      />
    );
  },
  table({ children }) {
    return <ChatMarkdownTableShell>{children}</ChatMarkdownTableShell>;
  },
  thead({ children }) {
    return <thead>{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-1.5 text-left align-top font-medium text-foreground">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border-t border-border px-2 py-1.5 align-top">{children}</td>;
  },
  section(props) {
    const { children, className } = props;
    const footnotes = (props as { "data-footnotes"?: boolean | string })["data-footnotes"];

    return (
      <section
        data-footnotes={footnotes}
        className={cn(
          "my-3 border-t border-border pt-2",
          className === "footnotes" && "text-[0.92em] text-muted-foreground"
        )}
      >
        {children}
      </section>
    );
  },
  br() {
    return <br />;
  },
  kbd({ children }) {
    return (
      <kbd className="corner-squircle inline-flex min-h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[0.82em] font-medium leading-none text-foreground shadow-sm">
        {children}
      </kbd>
    );
  },
  mark({ children }) {
    return <mark className="rounded bg-yellow-200 px-0.5 text-yellow-950">{children}</mark>;
  },
  sub({ children }) {
    return <sub className="text-[0.75em]">{children}</sub>;
  },
  sup({ children, id }) {
    return <sup id={id} className="text-[0.75em]">{children}</sup>;
  },
  u({ children }) {
    return <span className="underline underline-offset-2">{children}</span>;
  },
  hr() {
    return <div className="my-3 border-t border-border" />;
  },
};

/**
 * Compact Markdown renderer for chat messages. It avoids the notebook Markdown
 * preview package in the streaming path while preserving GFM, math, and code UI.
 */
export function ChatMarkdownRenderer({ source, fontSize }: ChatMarkdownRendererProps) {
  if (!source) return null;

  return (
    <div
      data-chat-markdown-root=""
      className={cn(
        "min-w-0 max-w-none break-words text-foreground",
        "[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden"
      )}
      style={{ fontSize }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeSlug, rehypeKatex, rehypeMarkKatexSpans]}
        allowedElements={allowedMarkdownElements}
        components={markdownComponents}
        urlTransform={defaultUrlTransform}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
