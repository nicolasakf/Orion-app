export const NOTEBOOK_EDITOR_STYLE_SCOPE = ".notebook-editor-content-area";
export const NOTEBOOK_RENDERED_STYLE_SCOPES = [
  `${NOTEBOOK_EDITOR_STYLE_SCOPE} .jp-RenderedHTMLCommon`,
  `${NOTEBOOK_EDITOR_STYLE_SCOPE} .jp-OutputArea-output`,
  ".orion-app-view .jp-RenderedHTMLCommon",
  ".orion-app-view .jp-OutputArea-output",
] as const;

const STYLE_TAG_PATTERN = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const INPUT_SELECTOR_PATTERN =
  /\.(?:cm-editor|cm-content|jp-InputArea-editor|jp-Cell-inputArea|jp-CodeMirrorEditor|monaco-editor)\b/;
const NOTEBOOK_CONTAINER_SELECTOR_PATTERN =
  /^\.(?:jp-Notebook|jp-Cell|jp-CodeCell|jp-MarkdownCell|jp-Cell-outputArea|text_cell_render|output_text|output_area)\b/;
const NESTED_CSS_AT_RULES = new Set([
  "container",
  "document",
  "layer",
  "media",
  "scope",
  "starting-style",
  "supports",
]);

/**
 * Rewrites CSS selectors inside HTML <style> tags so notebook-authored styles
 * can change notebook content without leaking into the surrounding Orion app.
 */
export function scopeHtmlStyleTags(
  html: string,
  scopeSelectors: readonly string[] = NOTEBOOK_RENDERED_STYLE_SCOPES,
): string {
  if (!html.toLowerCase().includes("<style")) return html;

  return html.replace(
    STYLE_TAG_PATTERN,
    (match: string, attributes: string, css: string) => {
      if (/\bdata-orion-style-scoped\s*=/.test(attributes)) return match;

      return `<style${attributes} data-orion-style-scoped="notebook-editor">${scopeCssToNotebook(css, scopeSelectors)}</style>`;
    },
  );
}

/**
 * Scopes a stylesheet to the notebook editor content area.
 */
export function scopeCssToNotebook(
  css: string,
  scopeSelectors: readonly string[] = NOTEBOOK_RENDERED_STYLE_SCOPES,
): string {
  return scopeCssRules(css, [...scopeSelectors]);
}

/** Walks CSS rule blocks while preserving declarations and non-style at-rules. */
function scopeCssRules(css: string, scopeSelectors: string[]): string {
  let output = "";
  let cursor = 0;

  while (cursor < css.length) {
    const openBraceIndex = findNextTopLevelOpenBrace(css, cursor);
    if (openBraceIndex === -1) {
      output += css.slice(cursor);
      break;
    }

    const closeBraceIndex = findMatchingCloseBrace(css, openBraceIndex);
    if (closeBraceIndex === -1) {
      output += css.slice(cursor);
      break;
    }

    const prelude = css.slice(cursor, openBraceIndex);
    const block = css.slice(openBraceIndex + 1, closeBraceIndex);
    const atRuleName = getAtRuleName(prelude);

    if (atRuleName) {
      const scopedBlock = NESTED_CSS_AT_RULES.has(atRuleName)
        ? scopeCssRules(block, scopeSelectors)
        : block;
      output += `${prelude}{${scopedBlock}}`;
    } else {
      const scopedPrelude = scopeSelectorList(prelude, scopeSelectors);
      if (scopedPrelude) output += `${scopedPrelude}{${block}}`;
    }

    cursor = closeBraceIndex + 1;
  }

  return output;
}

/** Prefixes each selector in a comma-separated selector list with the scope. */
function scopeSelectorList(
  selectorList: string,
  scopeSelectors: string[],
): string {
  return splitSelectorList(selectorList)
    .flatMap((selector) => scopeSelector(selector, scopeSelectors))
    .join(", ");
}

/** Scopes one selector, handling document roots and notebook-root class hooks. */
function scopeSelector(selector: string, scopeSelectors: string[]): string[] {
  const leadingWhitespace = selector.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = selector.match(/\s*$/)?.[0] ?? "";
  const trimmed = selector.trim();

  if (!trimmed || INPUT_SELECTOR_PATTERN.test(trimmed)) return [];
  if (trimmed === "*") {
    return scopeSelectors.flatMap((scopeSelector) => [
      `${leadingWhitespace}${scopeSelector}${trailingWhitespace}`,
      `${leadingWhitespace}${scopeSelector} *${trailingWhitespace}`,
    ]);
  }

  const rootScopedSelector = scopeDocumentRootSelector(trimmed, scopeSelectors);
  if (rootScopedSelector) {
    return rootScopedSelector.map(
      (scopedSelector) =>
        `${leadingWhitespace}${scopedSelector}${trailingWhitespace}`,
    );
  }

  if (/^[.#[:]/.test(trimmed)) {
    return scopeSelectors.flatMap((scopeSelector) => [
      `${leadingWhitespace}${scopeSelector}${trimmed}${trailingWhitespace}`,
      `${leadingWhitespace}${scopeSelector} ${trimmed}${trailingWhitespace}`,
    ]);
  }

  if (/^[>+~]/.test(trimmed)) {
    return scopeSelectors.map(
      (scopeSelector) =>
        `${leadingWhitespace}${scopeSelector} ${trimmed}${trailingWhitespace}`,
    );
  }

  return scopeSelectors.map(
    (scopeSelector) =>
      `${leadingWhitespace}${scopeSelector} ${trimmed}${trailingWhitespace}`,
  );
}

/**
 * Maps document/notebook-wide selectors to rendered markdown and output areas.
 */
function scopeDocumentRootSelector(
  selector: string,
  scopeSelectors: string[],
): string[] | null {
  const rootMatch =
    selector.match(/^(body|html|:root)\b/i) ??
    selector.match(NOTEBOOK_CONTAINER_SELECTOR_PATTERN);
  if (!rootMatch) return null;

  const rest = selector.slice(rootMatch[0].length);
  if (!rest) return scopeSelectors;
  if (/^\s|^[>+~]/.test(rest)) {
    return scopeSelectors.map((scopeSelector) => `${scopeSelector}${rest}`);
  }
  return scopeSelectors.flatMap((scopeSelector) => [
    `${scopeSelector}${rest}`,
    `${scopeSelector} ${rest}`,
  ]);
}

/** Splits selectors on top-level commas without breaking :is(), attributes, or strings. */
function splitSelectorList(selectorList: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let parenthesesDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;

  for (let index = 0; index < selectorList.length; index += 1) {
    const character = selectorList[index];
    const previous = selectorList[index - 1];

    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (character === "(") parenthesesDepth += 1;
    if (character === ")") parenthesesDepth = Math.max(0, parenthesesDepth - 1);
    if (character === "[") bracketDepth += 1;
    if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    if (character === "," && parenthesesDepth === 0 && bracketDepth === 0) {
      selectors.push(selectorList.slice(start, index));
      start = index + 1;
    }
  }

  selectors.push(selectorList.slice(start));
  return selectors;
}

/** Finds the next rule-opening brace, skipping strings and comments. */
function findNextTopLevelOpenBrace(css: string, startIndex: number): number {
  return findNextBrace(css, startIndex, "{");
}

/** Finds a matching close brace for a CSS block, skipping strings and comments. */
function findMatchingCloseBrace(css: string, openBraceIndex: number): number {
  let depth = 1;
  let quote: string | null = null;
  let inComment = false;

  for (let index = openBraceIndex + 1; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];
    const previous = css[index - 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }

    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

/** Finds the next target brace while skipping CSS strings and comments. */
function findNextBrace(
  css: string,
  startIndex: number,
  target: "{" | "}",
): number {
  let quote: string | null = null;
  let inComment = false;

  for (let index = startIndex; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];
    const previous = css[index - 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }

    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (character === target) return index;
  }

  return -1;
}

/** Extracts an at-rule name from a CSS rule prelude. */
function getAtRuleName(prelude: string): string | null {
  const match = prelude.trim().match(/^@([\w-]+)/);
  return match?.[1].toLowerCase() ?? null;
}
