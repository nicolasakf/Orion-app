/** Per-cell source delta used by notebook mutation tools and tool cards. */
export interface CellSourceDelta {
  cellIndex: number;
  addedLines: number;
  removedLines: number;
  diffText: string;
}

interface DiffOp {
  kind: "equal" | "add" | "remove";
  line: string;
}

/** Normalizes source before line-oriented diffing. */
export function normalizeSourceForCellDiff(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
}

/** Splits source into logical code lines; an empty cell has zero lines. */
export function sourceToDiffLines(source: string): string[] {
  const normalized = normalizeSourceForCellDiff(source);
  return normalized === "" ? [] : normalized.split("\n");
}

/** Computes a stable line-oriented diff using a longest-common-subsequence table. */
function diffLines(oldLines: string[], newLines: string[]): DiffOp[] {
  const lcs: number[][] = Array.from({ length: oldLines.length + 1 }, () =>
    Array.from({ length: newLines.length + 1 }, () => 0)
  );

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        oldLines[i] === newLines[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: "equal", line: oldLines[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: "remove", line: oldLines[i]! });
      i += 1;
    } else {
      ops.push({ kind: "add", line: newLines[j]! });
      j += 1;
    }
  }
  while (i < oldLines.length) {
    ops.push({ kind: "remove", line: oldLines[i]! });
    i += 1;
  }
  while (j < newLines.length) {
    ops.push({ kind: "add", line: newLines[j]! });
    j += 1;
  }
  return ops;
}

/** Computes source-code line additions/removals and a unified-style diff. */
export function computeCellSourceDelta(
  cellIndex: number,
  oldSource: string,
  newSource: string
): CellSourceDelta {
  const oldLines = sourceToDiffLines(oldSource);
  const newLines = sourceToDiffLines(newSource);
  const ops = diffLines(oldLines, newLines);
  const addedLines = ops.filter((op) => op.kind === "add").length;
  const removedLines = ops.filter((op) => op.kind === "remove").length;

  if (addedLines === 0 && removedLines === 0) {
    return {
      cellIndex,
      addedLines,
      removedLines,
      diffText: "no changes detected",
    };
  }

  const diffText = [
    "--- old",
    "+++ new",
    ...ops.map((op) => {
      if (op.kind === "add") return `+${op.line}`;
      if (op.kind === "remove") return `-${op.line}`;
      return ` ${op.line}`;
    }),
  ].join("\n");

  return { cellIndex, addedLines, removedLines, diffText };
}

/** Formats per-cell deltas into the tool-result text consumed by the card UI. */
export function formatCellSourceDeltaSummary(deltas: CellSourceDelta[]): string {
  if (deltas.length === 0) return "";
  return [
    "Cell source changes:",
    ...deltas.map(
      (delta) =>
        `Cell ${delta.cellIndex}: +${delta.addedLines} -${delta.removedLines} lines`
    ),
  ].join("\n");
}

/** Formats expandable per-cell diff blocks for notebook mutation tool results. */
export function formatCellSourceDeltaDiffs(deltas: CellSourceDelta[]): string {
  if (deltas.length === 0) return "";
  return deltas
    .map(
      (delta) =>
        `Cell ${delta.cellIndex} diff:\n\n\`\`\`diff\n${delta.diffText}\n\`\`\``
    )
    .join("\n\n---\n\n");
}
