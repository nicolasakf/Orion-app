"use client";

import { createElement, type CSSProperties, type JSX, type ReactNode } from "react";
import type { NotebookMimeRendererProps } from "./types";

type VDomNode = string | number | boolean | null | VDomElement | VDomNode[];

interface VDomElement {
  tagName?: string;
  tag?: string;
  children?: VDomNode;
  attributes?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
  props?: Record<string, unknown>;
}

const SAFE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "button",
  "caption",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

/** HTML void elements: React forbids children or dangerouslySetInnerHTML on these. */
const VOID_HTML_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseStyle(value: unknown): CSSProperties | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const style: CSSProperties = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue === "string" || typeof rawValue === "number") {
      (style as Record<string, string | number>)[key] = rawValue;
    }
  }
  return style;
}

function sanitizeProps(rawProps: Record<string, unknown>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawProps)) {
    if (key === "dangerouslySetInnerHTML" || key === "children") {
      continue;
    }
    if (key.startsWith("on")) {
      continue;
    }
    if (key === "class") {
      props.className = value;
      continue;
    }
    if (key === "style") {
      props.style = parseStyle(value);
      continue;
    }
    if (
      key === "href" &&
      typeof value === "string" &&
      value.trim().toLowerCase().startsWith("javascript:")
    ) {
      continue;
    }
    if (
      key === "src" &&
      typeof value === "string" &&
      value.trim().toLowerCase().startsWith("javascript:")
    ) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      props[key] = value;
    }
  }
  return props;
}

function renderVDomNode(node: VDomNode, key = "root"): ReactNode {
  if (node === null || node === false || node === true) {
    return null;
  }
  if (typeof node === "string" || typeof node === "number") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child, index) => renderVDomNode(child, `${key}-${index}`));
  }

  const tagName = (node.tagName ?? node.tag ?? "div").toLowerCase();
  const tag = SAFE_TAGS.has(tagName) ? tagName : "div";
  const rawProps = {
    ...(node.attributes ?? {}),
    ...(node.attrs ?? {}),
    ...(node.props ?? {}),
  };
  const props = {
    ...sanitizeProps(rawProps),
    key,
  };

  if (VOID_HTML_TAGS.has(tag)) {
    return createElement(tag, props);
  }

  const children = renderVDomNode(node.children ?? [], `${key}-children`);
  return createElement(tag, props, children);
}

/**
 * Render nteract VDOM MIME bundles as sanitized React elements.
 */
export function VDomOutputRenderer({
  value,
}: NotebookMimeRendererProps): JSX.Element {
  const root = asRecord(value);
  if (!root) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Empty VDOM output.
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3">
      {renderVDomNode(root as VDomElement)}
    </div>
  );
}
