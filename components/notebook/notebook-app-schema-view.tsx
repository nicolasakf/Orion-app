"use client";

import React, { useMemo } from "react";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import { OrionUiPrimitiveTree } from "@/components/notebook/orion-ui-primitives";
import type {
  OrionUiLocalValue,
  OrionUiRenderCallbacks,
} from "@/components/notebook/orion-ui-primitives";
import { OutputRenderer } from "@/components/notebook/output-renderer";
import {
  getNotebookAppViewCss,
  getNotebookCellId,
  type NotebookAppViewSchema,
} from "@/lib/notebook/app-view";
import { CellType, type NotebookCellType, type NotebookType } from "@/lib/types";

interface NotebookAppSchemaViewProps {
  notebook: NotebookType;
  schema: NotebookAppViewSchema;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
}

const APP_VIEW_ROOT_CLASS = "orion-app-view";

/**
 * Prefixes App View selectors so notebook-level CSS cannot leak outside the app
 * surface. This intentionally supports regular style rules plus common wrapper
 * at-rules; global at-rules such as keyframes and font-face are preserved.
 */
function scopeAppViewCss(css: string, scopeSelector: string): string {
  const source = css.trim();
  if (!source) {
    return "";
  }

  return scopeCssRules(source, scopeSelector);
}

/** Scopes a sequence of CSS rules with a stable App View root selector. */
function scopeCssRules(css: string, scopeSelector: string): string {
  let index = 0;
  let output = "";

  while (index < css.length) {
    const nextOpen = css.indexOf("{", index);
    if (nextOpen === -1) {
      output += css.slice(index);
      break;
    }

    const prelude = css.slice(index, nextOpen).trim();
    const close = findCssBlockEnd(css, nextOpen);
    if (close === -1) {
      output += css.slice(index);
      break;
    }

    const body = css.slice(nextOpen + 1, close);
    output += serializeScopedRule(prelude, body, scopeSelector);
    index = close + 1;
  }

  return output;
}

/** Finds the closing brace for a CSS block while respecting nested blocks. */
function findCssBlockEnd(css: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = openIndex; index < css.length; index += 1) {
    const char = css[index];
    const previous = css[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

/** Serializes one CSS rule, recursively scoping nested conditional groups. */
function serializeScopedRule(
  prelude: string,
  body: string,
  scopeSelector: string,
): string {
  if (!prelude) {
    return "";
  }

  if (prelude.startsWith("@")) {
    const lowerPrelude = prelude.toLowerCase();
    const shouldScopeBody =
      lowerPrelude.startsWith("@media") ||
      lowerPrelude.startsWith("@supports") ||
      lowerPrelude.startsWith("@container") ||
      lowerPrelude.startsWith("@layer");

    return shouldScopeBody
      ? `${prelude}{${scopeCssRules(body, scopeSelector)}}`
      : `${prelude}{${body}}`;
  }

  const scopedPrelude = splitSelectorList(prelude)
    .map((selector) => scopeSelectorText(selector, scopeSelector))
    .join(", ");
  return `${scopedPrelude}{${body}}`;
}

/** Splits a selector list on top-level commas only. */
function splitSelectorList(selectorList: string): string[] {
  const selectors: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;

  for (const char of selectorList) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      selectors.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    selectors.push(current.trim());
  }

  return selectors;
}

/** Prefixes one selector with the App View scope unless it is already scoped. */
function scopeSelectorText(selector: string, scopeSelector: string): string {
  if (!selector || selector.startsWith(scopeSelector)) {
    return selector;
  }

  return selector === ":root"
    ? scopeSelector
    : `${scopeSelector} ${selector}`;
}

/** Builds a lookup table for stable cell id references. */
function getCellsById(
  cells: NotebookCellType[],
): Map<string, { cell: NotebookCellType; cellIndex: number }> {
  const entries = cells.flatMap((cell, cellIndex) => {
    const cellId = getNotebookCellId(cell);
    return cellId ? [[cellId, { cell, cellIndex }] as const] : [];
  });

  return new Map(entries);
}

/** Extracts notebook cell source as a single markdown string. */
function sourceToString(source: string[] | undefined): string {
  return Array.isArray(source) ? source.join("") : "";
}

/** Renders a declarative App View schema using Orion's shared primitive registry. */
export function NotebookAppSchemaView({
  notebook,
  schema,
  onOrionUiStateChange,
  onOrionUiAction,
}: NotebookAppSchemaViewProps): React.JSX.Element {
  const appViewCss = getNotebookAppViewCss(notebook.metadata);
  const scopedAppViewCss = useMemo(
    () => scopeAppViewCss(appViewCss ?? "", `.${APP_VIEW_ROOT_CLASS}`),
    [appViewCss],
  );
  const cellsById = useMemo(
    () => getCellsById(notebook.cells),
    [notebook.cells],
  );

  const callbacks = useMemo<OrionUiRenderCallbacks>(
    () => ({
      onStateChange: (key, value) => onOrionUiStateChange?.(key, value),
      onAction: onOrionUiAction,
      renderMarkdownReference: (cellId, fallbackSource) => {
        const entry = cellId ? cellsById.get(cellId) : undefined;
        const source =
          fallbackSource ??
          (entry?.cell.cell_type === CellType.MARKDOWN
            ? sourceToString(entry.cell.source)
            : undefined);

        return source ? <MarkdownRenderer source={source} /> : undefined;
      },
      renderOutputReference: (cellId, outputIndex) => {
        const entry = cellId ? cellsById.get(cellId) : undefined;
        const output = entry?.cell.outputs?.[outputIndex];

        return output && entry ? (
          <OutputRenderer
            output={output}
            notebookMetadata={notebook.metadata}
            cellIndex={entry.cellIndex}
            outputIndex={outputIndex}
            onOrionUiStateChange={(key, value, outputId) =>
              onOrionUiStateChange?.(key, value, outputId)
            }
            onOrionUiAction={onOrionUiAction}
          />
        ) : undefined;
      },
    }),
    [
      cellsById,
      notebook.metadata,
      onOrionUiAction,
      onOrionUiStateChange,
    ],
  );

  return (
    <div
      className={`${APP_VIEW_ROOT_CLASS} min-h-0 flex-1 overflow-y-auto bg-sidebar`}
      data-notebook-export-root="app"
    >
      {scopedAppViewCss ? (
        <style data-orion-app-view-css>{scopedAppViewCss}</style>
      ) : null}
      <OrionUiPrimitiveTree root={schema.root} callbacks={callbacks} />
    </div>
  );
}
