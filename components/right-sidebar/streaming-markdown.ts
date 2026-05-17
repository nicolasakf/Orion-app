"use client";

export interface StreamingMarkdownParts {
  /** Markdown that is safe to render richly during streaming. */
  stable: string;
  /** The active block still receiving tokens. */
  tail: string;
}

interface LineSlice {
  text: string;
  end: number;
  hasNewline: boolean;
}

/** Split text into line slices while preserving original string offsets. */
function splitLinesWithOffsets(content: string): LineSlice[] {
  const lines: LineSlice[] = [];
  let start = 0;

  for (const match of content.matchAll(/\n/g)) {
    const end = match.index + 1;
    lines.push({
      text: content.slice(start, end),
      end,
      hasNewline: true,
    });
    start = end;
  }

  if (start < content.length) {
    lines.push({
      text: content.slice(start),
      end: content.length,
      hasNewline: false,
    });
  }

  return lines;
}

/** Remove one trailing line break from a line slice. */
function lineWithoutBreak(line: string): string {
  return line.replace(/\r?\n$/, "");
}

/** True when a line opens or closes a fenced code block. */
function isFenceLine(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

/** True when a line is a Markdown ordered or unordered list item. */
function isListLine(line: string): boolean {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

/** True when a line is an ATX Markdown heading. */
function isHeadingLine(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

/** True when a line is a Markdown horizontal rule. */
function isThematicBreak(line: string): boolean {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

/** True when a line is part of a Markdown blockquote. */
function isBlockquoteLine(line: string): boolean {
  return /^\s{0,3}>\s?/.test(line);
}

/** True when a line could be part of a pipe table. */
function isTableRowLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.split("|").length >= 3;
}

/** True when a pipe-table line is the required GFM header separator. */
function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;

  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * Find the last point where the streaming Markdown can be rendered richly
 * without stealing text from the unfinished block currently receiving tokens.
 */
export function findStableMarkdownBoundary(content: string): number {
  if (!content) return 0;

  let inCodeFence = false;
  let inTable = false;
  let pendingTableHeader = false;
  let lastBoundary = 0;

  for (const slice of splitLinesWithOffsets(content)) {
    const line = lineWithoutBreak(slice.text);
    const trimmed = line.trim();

    if (!slice.hasNewline) {
      break;
    }

    if (isFenceLine(line)) {
      inCodeFence = !inCodeFence;
      inTable = false;
      pendingTableHeader = false;
      if (!inCodeFence) {
        lastBoundary = slice.end;
      }
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    if (trimmed === "") {
      inTable = false;
      pendingTableHeader = false;
      lastBoundary = slice.end;
      continue;
    }

    if (inTable) {
      if (isTableRowLine(line)) {
        lastBoundary = slice.end;
        continue;
      }
      inTable = false;
      pendingTableHeader = false;
    }

    if (pendingTableHeader) {
      if (isTableSeparatorLine(line)) {
        inTable = true;
        pendingTableHeader = false;
        lastBoundary = slice.end;
        continue;
      }
      pendingTableHeader = false;
    }

    if (isTableRowLine(line)) {
      pendingTableHeader = true;
      continue;
    }

    if (
      isListLine(line) ||
      isHeadingLine(line) ||
      isThematicBreak(line) ||
      isBlockquoteLine(line)
    ) {
      lastBoundary = slice.end;
    }
  }

  return lastBoundary;
}

/**
 * Split active assistant text into a rich-renderable prefix and one unfinished
 * tail. Boundary whitespace may be normalized, but each non-boundary character
 * appears in only one part.
 */
export function splitStreamingMarkdown(content: string): StreamingMarkdownParts {
  const boundary = findStableMarkdownBoundary(content);
  if (boundary <= 0) {
    return { stable: "", tail: content };
  }

  return {
    stable: content.slice(0, boundary).trimEnd(),
    tail: content.slice(boundary).replace(/^\r?\n/, ""),
  };
}
