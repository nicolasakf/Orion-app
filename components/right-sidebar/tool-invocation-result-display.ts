/**
 * Derives a shorter string for tool invocation cards while the stored tool
 * result remains unchanged (full text still goes to the model).
 *
 * In development, {@link getToolResultDisplaySegments} splits the full result into
 * user-visible vs stripped regions for two-tone rendering in the UI.
 */

import { extractTerminalResultOutputForDisplay } from "@/lib/agent/tools/terminal-command-utils";
import type { OrionToolName } from "@/lib/agent/tool-schemas";

/** True when the app runs in development (`next dev`). Inlined at build time. */
export const IS_TOOL_CARD_DEV_OVERLAY =
  process.env.NODE_ENV === "development";

/** A contiguous slice of the tool result; `strippedFromUserCard` marks metadata hidden in production cards. */
export type ToolResultDisplaySegment = {
  strippedFromUserCard: boolean;
  text: string;
};

export type NotebookCellSourceChangeDisplay = {
  cellIndex: number;
  addedLines: number;
  removedLines: number;
  diffText?: string;
};

/** Extracts the mutation-tool cell delta section from a tool result. */
export function getNotebookCellSourceChanges(
  fullResultText: string
): NotebookCellSourceChangeDisplay[] {
  if (!fullResultText || fullResultText.startsWith("[ERROR")) return [];

  const summaryIndex = fullResultText.indexOf("Cell source changes:");
  if (summaryIndex === -1) return [];

  const afterSummary = fullResultText.slice(summaryIndex).split(/\r?\n/);
  const changes: NotebookCellSourceChangeDisplay[] = [];
  for (const line of afterSummary.slice(1)) {
    if (!line.trim()) break;
    const match = line.match(/^Cell (\d+): \+(\d+) -(\d+) lines$/);
    if (!match) break;
    changes.push({
      cellIndex: Number(match[1]),
      addedLines: Number(match[2]),
      removedLines: Number(match[3]),
    });
  }

  return changes.map((change) => {
    const diffRe = new RegExp(
      `Cell ${change.cellIndex} diff:\\n\\n\`\`\`diff\\n([\\s\\S]*?)\\n\`\`\``
    );
    const diffMatch = fullResultText.match(diffRe);
    return {
      ...change,
      diffText: diffMatch?.[1],
    };
  });
}

function mergeAdjacentSegments(segments: ToolResultDisplaySegment[]): ToolResultDisplaySegment[] {
  const out: ToolResultDisplaySegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.strippedFromUserCard === seg.strippedFromUserCard) {
      prev.text += seg.text;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/** Second line of a successful read_file result: horizontal rule of box-drawing chars. */
const READ_FILE_SEPARATOR_RE = /^[─\-_=]{20,}$/;

/**
 * Strips read_file header (`File: …` + rule line); errors unchanged.
 * @see ReadFileTool in lib/agent/tools/read-file.ts
 */
export function extractReadFileCardBody(formatted: string): string {
  if (formatted.startsWith("[ERROR")) return formatted;
  const lines = formatted.split(/\r?\n/);
  if (lines.length < 3) return formatted;
  const first = lines[0]?.trimStart() ?? "";
  const second = lines[1] ?? "";
  if (!first.startsWith("File: ")) return formatted;
  if (!READ_FILE_SEPARATOR_RE.test(second.trim())) return formatted;
  return lines.slice(2).join("\n");
}

/** First line of read_notebook success: `Notebook '…' has N cells.` */
const READ_NOTEBOOK_HEADER_RE = /^Notebook '[^']*' has \d+ cells\.\s*$/;

/**
 * Removes the leading notebook summary line from read_notebook output.
 * @see ReadNotebookTool in lib/agent/tools/read-notebook.ts
 */
export function extractReadNotebookCardBody(formatted: string): string {
  if (formatted.startsWith("[ERROR") || formatted.startsWith("[WARNING")) {
    return formatted;
  }
  const lines = formatted.split(/\r?\n/);
  if (lines.length === 0) return formatted;
  const head = lines[0]?.trimEnd() ?? "";
  if (!READ_NOTEBOOK_HEADER_RE.test(head)) return formatted;
  return lines.slice(1).join("\n").replace(/^\n+/, "");
}

/** Cell banner from read_cell / read_notebook detailed format. */
function isReadCellBannerLine(line: string): boolean {
  const t = line.trim();
  return /^=====Cell \d+ \| type: [^|]+ \| execution count: [^=]+=====$/.test(t);
}

/** Whether this read_cell line is omitted from the user-facing card body. */
function isReadCellStrippedLine(line: string): boolean {
  const t = line.trim();
  if (isReadCellBannerLine(line)) return true;
  if (t === "--- Outputs ---") return true;
  if (/^={10,}$/.test(t)) return true;
  return false;
}

/**
 * Removes read_cell decorative lines (cell banners, output labels, batch dividers).
 * @see ReadCellTool in lib/agent/tools/read-cell.ts
 */
export function extractReadCellCardBody(formatted: string): string {
  if (formatted.startsWith("[ERROR")) return formatted;
  const lines = formatted.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!isReadCellStrippedLine(line)) out.push(line);
  }
  return out.join("\n");
}

/**
 * Text shown in the expanded tool card (metadata stripped for selected tools).
 */
export function cardDisplayTextForToolResult(
  toolName: OrionToolName,
  fullResultText: string
): string {
  switch (toolName) {
    case "bash":
    case "await_command":
      return extractTerminalResultOutputForDisplay(fullResultText);
    case "read_file":
      return extractReadFileCardBody(fullResultText);
    case "read_notebook":
      return extractReadNotebookCardBody(fullResultText);
    case "read_cell":
      return extractReadCellCardBody(fullResultText);
    default:
      return fullResultText;
  }
}

/**
 * Splits the raw tool result into segments for dev-mode two-tone rendering: regions
 * that match the production card body are `strippedFromUserCard: false` (foreground);
 * metadata hidden in production is `strippedFromUserCard: true` (muted).
 */
export function getToolResultDisplaySegments(
  toolName: OrionToolName,
  fullResultText: string
): ToolResultDisplaySegment[] {
  const single = (stripped: boolean): ToolResultDisplaySegment[] => [
    { strippedFromUserCard: stripped, text: fullResultText },
  ];

  switch (toolName) {
    case "bash":
    case "await_command": {
      const lines = fullResultText.split(/\r?\n/);
      const outIdx = lines.findIndex((l) => l.trim() === "output:");
      if (outIdx === -1) return single(false);
      const mutedLines = lines.slice(0, outIdx + 1);
      const mutedText = mutedLines.join("\n") + (lines.length > outIdx + 1 ? "\n" : "");
      const visibleText = lines.slice(outIdx + 1).join("\n");
      return mergeAdjacentSegments([
        { strippedFromUserCard: true, text: mutedText },
        { strippedFromUserCard: false, text: visibleText },
      ]);
    }
    case "read_file": {
      if (fullResultText.startsWith("[ERROR")) return single(false);
      const lines = fullResultText.split(/\r?\n/);
      if (lines.length < 3) return single(false);
      const first = lines[0]?.trimStart() ?? "";
      const second = lines[1] ?? "";
      if (!first.startsWith("File: ") || !READ_FILE_SEPARATOR_RE.test(second.trim())) {
        return single(false);
      }
      const mutedText = `${lines[0]}\n${lines[1]}\n`;
      const visibleText = lines.slice(2).join("\n");
      return mergeAdjacentSegments([
        { strippedFromUserCard: true, text: mutedText },
        { strippedFromUserCard: false, text: visibleText },
      ]);
    }
    case "read_notebook": {
      if (fullResultText.startsWith("[ERROR") || fullResultText.startsWith("[WARNING")) {
        return single(false);
      }
      const lines = fullResultText.split(/\r?\n/);
      if (lines.length === 0) return single(false);
      const head = lines[0]?.trimEnd() ?? "";
      if (!READ_NOTEBOOK_HEADER_RE.test(head)) return single(false);
      const rest = lines.slice(1).join("\n");
      let i = 0;
      while (i < rest.length && rest[i] === "\n") i += 1;
      const visibleText = rest.slice(i);
      const mutedText = `${lines[0]}\n${rest.slice(0, i)}`;
      return mergeAdjacentSegments([
        { strippedFromUserCard: true, text: mutedText },
        { strippedFromUserCard: false, text: visibleText },
      ]);
    }
    case "read_cell": {
      if (fullResultText.startsWith("[ERROR")) return single(false);
      const rawLines = fullResultText.split(/\r?\n/);
      const segments: ToolResultDisplaySegment[] = [];
      for (let li = 0; li < rawLines.length; li += 1) {
        const line = rawLines[li]!;
        const isLast = li === rawLines.length - 1;
        const piece = isLast ? line : `${line}\n`;
        const stripped = isReadCellStrippedLine(line);
        segments.push({ strippedFromUserCard: stripped, text: piece });
      }
      return mergeAdjacentSegments(segments);
    }
    default:
      return single(false);
  }
}
