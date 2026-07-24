import type {
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import type {
  InlineMath as MdastInlineMath,
  Math as MdastMath,
} from "mdast-util-math";
import type { Plugin } from "unified";

type DisplaySplit =
  | { type: "text"; value: string }
  | { type: "math"; value: string };

const displayMathEnvironmentNames = new Set([
  "align",
  "align*",
  "aligned",
  "alignat",
  "alignat*",
  "array",
  "bmatrix",
  "Bmatrix",
  "cases",
  "equation",
  "equation*",
  "flalign",
  "flalign*",
  "gather",
  "gather*",
  "gathered",
  "matrix",
  "multline",
  "multline*",
  "pmatrix",
  "split",
  "Vmatrix",
  "vmatrix",
]);

const displayMathEnvironmentPattern =
  /^\s*\\begin\{([a-zA-Z*]+)\}[\s\S]*\\end\{\1\}\s*$/;

/**
 * True when a LaTeX environment name should be treated as display math.
 */
function isDisplayMathEnvironment(environment: string): boolean {
  return displayMathEnvironmentNames.has(environment);
}

/**
 * Returns the length of the backtick run at the current string offset.
 */
function getBacktickRunLength(value: string, offset: number): number {
  let length = 0;
  while (value[offset + length] === "`") {
    length += 1;
  }
  return length;
}

/**
 * True when a dollar sign begins a numeric currency amount.
 *
 * Single-dollar math and currency are otherwise ambiguous. Treating a dollar
 * followed by a number as currency preserves prose such as
 * "$119.8B of revenue and $40.8B" while leaving `$variable` math available.
 */
function startsNumericCurrencyAmount(value: string, offset: number): boolean {
  return /^\$[+-]?(?:\d|\.\d)/.test(value.slice(offset));
}

/**
 * True when the first later single-dollar delimiter can close numeric math.
 *
 * A later dollar that starts another numeric amount is currency, while a
 * delimiter preceded by whitespace cannot close inline math.
 */
function hasPlausibleClosingInlineMathDelimiter(
  value: string,
  openingOffset: number,
): boolean {
  let codeTickLength = 0;
  let offset = openingOffset + 1;

  while (offset < value.length) {
    if (value[offset] === "`") {
      const tickLength = getBacktickRunLength(value, offset);
      if (codeTickLength === 0) {
        codeTickLength = tickLength;
      } else if (tickLength === codeTickLength) {
        codeTickLength = 0;
      }
      offset += tickLength;
      continue;
    }

    if (
      codeTickLength === 0 &&
      value[offset] === "$" &&
      value[offset - 1] !== "\\"
    ) {
      if (value.slice(offset, offset + 2) === "$$") {
        offset += 2;
        continue;
      }

      const previousCharacter = value[offset - 1];
      return (
        previousCharacter !== undefined &&
        !/\s/.test(previousCharacter) &&
        !startsNumericCurrencyAmount(value, offset)
      );
    }

    offset += 1;
  }

  return false;
}

/** True when a line is a top-level indented Markdown code block. */
function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4}|\t)/.test(line);
}

/**
 * Converts MathJax delimiters and escapes currency on one line while
 * preserving inline code spans.
 */
function normalizeLineMathJaxDelimiters(line: string): string {
  let normalized = "";
  let codeTickLength = 0;
  let offset = 0;

  while (offset < line.length) {
    if (line[offset] === "`") {
      const tickLength = getBacktickRunLength(line, offset);
      if (codeTickLength === 0) {
        codeTickLength = tickLength;
      } else if (tickLength === codeTickLength) {
        codeTickLength = 0;
      }
      normalized += line.slice(offset, offset + tickLength);
      offset += tickLength;
      continue;
    }

    if (codeTickLength === 0) {
      const delimiter = line.slice(offset, offset + 2);
      if (delimiter === "\\(" || delimiter === "\\)") {
        normalized += "$";
        offset += 2;
        continue;
      }
      if (delimiter === "\\[" || delimiter === "\\]") {
        normalized += "$$";
        offset += 2;
        continue;
      }
      if (delimiter === "$$") {
        normalized += delimiter;
        offset += 2;
        continue;
      }
      if (
        line[offset] === "$" &&
        line[offset - 1] !== "\\" &&
        startsNumericCurrencyAmount(line, offset) &&
        !hasPlausibleClosingInlineMathDelimiter(line, offset)
      ) {
        normalized += "\\$";
        offset += 1;
        continue;
      }
    }

    normalized += line[offset];
    offset += 1;
  }

  return normalized;
}

/**
 * Finds a top-level LaTeX environment name at the start of a markdown line.
 */
function getLineStartingEnvironment(line: string): string | null {
  const match = /^\s*\\begin\{([a-zA-Z*]+)\}/.exec(line);
  const environment = match?.[1];
  return environment && isDisplayMathEnvironment(environment)
    ? environment
    : null;
}

/**
 * True when a line closes the given LaTeX environment.
 */
function closesEnvironment(line: string, environment: string): boolean {
  return line.includes(`\\end{${environment}}`);
}

/**
 * True when a line starts or closes a fenced code block.
 */
function isFenceLine(line: string): boolean {
  return /^\s{0,3}(```|~~~)/.test(line);
}

/**
 * Normalize MathJax-style delimiters before Markdown parsing consumes escapes.
 */
export function normalizeMarkdownMathSource(source: string): string {
  const lines = source.split("\n");
  const normalizedLines: string[] = [];
  let inFence = false;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (isFenceLine(line)) {
      inFence = !inFence;
      normalizedLines.push(line);
      lineIndex += 1;
      continue;
    }

    if (inFence) {
      normalizedLines.push(line);
      lineIndex += 1;
      continue;
    }

    if (isIndentedCodeLine(line)) {
      normalizedLines.push(line);
      lineIndex += 1;
      continue;
    }

    const environment = getLineStartingEnvironment(line);
    if (environment) {
      const environmentLines = [line];
      let endIndex = lineIndex;

      while (
        endIndex + 1 < lines.length &&
        !closesEnvironment(environmentLines.at(-1) ?? "", environment)
      ) {
        endIndex += 1;
        environmentLines.push(lines[endIndex]);
      }

      if (closesEnvironment(environmentLines.at(-1) ?? "", environment)) {
        normalizedLines.push("$$", ...environmentLines, "$$");
        lineIndex = endIndex + 1;
        continue;
      }
    }

    normalizedLines.push(normalizeLineMathJaxDelimiters(line));
    lineIndex += 1;
  }

  return normalizedLines.join("\n");
}

/**
 * Create an inline math node with the same hast metadata produced by remark-math.
 */
function createInlineMathNode(value: string): MdastInlineMath {
  return {
    type: "inlineMath",
    value,
    data: {
      hName: "code",
      hProperties: {
        className: ["language-math", "math-inline"],
      },
      hChildren: [{ type: "text", value }],
    },
  };
}

/**
 * Create a display math node with the same hast metadata produced by remark-math.
 */
function createDisplayMathNode(value: string): MdastMath {
  return {
    type: "math",
    value: value.trim(),
    meta: null,
    data: {
      hName: "pre",
      hChildren: [
        {
          type: "element",
          tagName: "code",
          properties: {
            className: ["language-math", "math-display"],
          },
          children: [{ type: "text", value: value.trim() }],
        },
      ],
    },
  };
}

/**
 * True when a markdown node has replaceable children.
 */
function isParentNode(node: unknown): node is Parent {
  return (
    typeof node === "object" &&
    node !== null &&
    Array.isArray((node as { children?: unknown }).children)
  );
}

/**
 * True when a phrasing node is plain text that can contain math delimiters.
 */
function isTextNode(node: PhrasingContent): node is Text {
  return node.type === "text";
}

/**
 * Split text by MathJax display delimiters (`\\[...\\]`).
 */
function splitDisplayMathText(value: string): DisplaySplit[] {
  const parts: DisplaySplit[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf("\\[", cursor);
    if (start === -1) {
      parts.push({ type: "text", value: value.slice(cursor) });
      break;
    }

    const end = value.indexOf("\\]", start + 2);
    if (end === -1) {
      parts.push({ type: "text", value: value.slice(cursor) });
      break;
    }

    if (start > cursor) {
      parts.push({ type: "text", value: value.slice(cursor, start) });
    }
    parts.push({ type: "math", value: value.slice(start + 2, end) });
    cursor = end + 2;
  }

  return parts.filter((part) => part.value.length > 0);
}

/**
 * Split text by MathJax inline delimiters (`\\(...\\)`).
 */
function splitInlineMathText(value: string): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf("\\(", cursor);
    if (start === -1) {
      parts.push({ type: "text", value: value.slice(cursor) });
      break;
    }

    const end = value.indexOf("\\)", start + 2);
    if (end === -1) {
      parts.push({ type: "text", value: value.slice(cursor) });
      break;
    }

    if (start > cursor) {
      parts.push({ type: "text", value: value.slice(cursor, start) });
    }
    parts.push(createInlineMathNode(value.slice(start + 2, end)));
    cursor = end + 2;
  }

  return parts.filter((part) => part.type !== "text" || part.value.length > 0);
}

/**
 * Clone a paragraph with new children while dropping stale source positions.
 */
function createParagraphFrom(
  paragraph: Paragraph,
  children: PhrasingContent[],
): Paragraph {
  const { children: _children, position: _position, ...paragraphProps } = paragraph;
  return {
    ...paragraphProps,
    type: "paragraph",
    children,
  };
}

/**
 * Split paragraphs that contain display math into paragraph/math siblings.
 */
function splitParagraphDisplayMath(paragraph: Paragraph): RootContent[] {
  const plainText = paragraph.children
    .map((child) => (isTextNode(child) ? child.value : ""))
    .join("");

  if (
    paragraph.children.every(isTextNode) &&
    displayMathEnvironmentPattern.test(plainText)
  ) {
    const environment = displayMathEnvironmentPattern.exec(plainText)?.[1];
    if (environment && isDisplayMathEnvironment(environment)) {
      return [createDisplayMathNode(plainText)];
    }
  }

  const result: RootContent[] = [];
  let pendingChildren: PhrasingContent[] = [];

  const flushParagraph = () => {
    if (pendingChildren.length === 0) return;
    result.push(createParagraphFrom(paragraph, pendingChildren));
    pendingChildren = [];
  };

  for (const child of paragraph.children) {
    if (!isTextNode(child)) {
      pendingChildren.push(child);
      continue;
    }

    for (const part of splitDisplayMathText(child.value)) {
      if (part.type === "text") {
        pendingChildren.push({ type: "text", value: part.value });
        continue;
      }

      flushParagraph();
      result.push(createDisplayMathNode(part.value));
    }
  }

  flushParagraph();
  return result.length > 0 ? result : [paragraph];
}

/**
 * Convert display math delimiters in paragraph nodes throughout a tree.
 */
function transformDisplayMath(parent: Parent): void {
  const children = parent.children as RootContent[];
  const nextChildren: RootContent[] = [];

  for (const child of children) {
    if (isParentNode(child)) {
      transformDisplayMath(child);
    }

    if (child.type === "paragraph") {
      nextChildren.push(...splitParagraphDisplayMath(child));
    } else {
      nextChildren.push(child);
    }
  }

  parent.children = nextChildren;
}

/**
 * Convert inline MathJax delimiters in text nodes throughout a tree.
 */
function transformInlineMath(parent: Parent): void {
  const nextChildren = [];

  for (const child of parent.children) {
    if (child.type === "text") {
      nextChildren.push(...splitInlineMathText(child.value));
      continue;
    }

    if (isParentNode(child)) {
      transformInlineMath(child);
    }
    nextChildren.push(child);
  }

  parent.children = nextChildren;
}

/**
 * Remark plugin for Jupyter/MathJax math delimiters not parsed by remark-math.
 */
export const remarkMathJaxDelimiters: Plugin<[], Root> = () => {
  return (tree) => {
    transformDisplayMath(tree);
    transformInlineMath(tree);
  };
};
