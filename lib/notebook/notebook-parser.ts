import { CellType, type NotebookCellType, type NotebookType } from "@/lib/types";

/**
 * Normalizes a single notebook cell, ensuring it has valid `source`, `cell_type`,
 * and `metadata` fields. Handles Jupyter's flexibility where `source` can be a
 * string or string array.
 *
 * Returns a normalized cell or an error placeholder if the cell is irrecoverably
 * malformed.
 */
function normalizeCell(raw: unknown, index: number): NotebookCellType {
  if (!raw || typeof raw !== "object") {
    return createErrorCell(
      `Cell ${index} is not a valid object`,
      JSON.stringify(raw) ?? ""
    );
  }

  const cell = raw as Record<string, unknown>;

  const cellType = normalizeCellType(cell.cell_type);
  const source = normalizeCellSource(cell.source);
  const metadata =
    cell.metadata && typeof cell.metadata === "object"
      ? (cell.metadata as Record<string, unknown>)
      : {};

  const normalized: NotebookCellType = {
    cell_type: cellType,
    source,
    metadata,
  };

  if (cellType === CellType.CODE) {
    normalized.outputs = Array.isArray(cell.outputs)
      ? (cell.outputs.map(normalizeOutput) as NotebookCellType["outputs"])
      : [];
    normalized.execution_count =
      typeof cell.execution_count === "number" ? cell.execution_count : null;
  }

  return normalized;
}

/**
 * Normalizes a multiline_string field (Jupyter nbformat) to always be a
 * string array. The spec allows either a plain string or an array of strings.
 * ContentsManager often returns a single joined string; the raw .ipynb file
 * stores an array. Normalizing here keeps the rest of the code consistent.
 */
function normalizeMultilineString(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === "string" ? item : String(item)));
  }
  if (typeof raw === "string") {
    if (raw === "") return [];
    return raw.split("\n").map((line, i, arr) =>
      i === arr.length - 1 ? line : line + "\n"
    );
  }
  return [];
}

/**
 * Normalizes a single cell output, ensuring multiline_string fields
 * (`text`, `traceback`) are always string arrays.
 */
function normalizeOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const output = raw as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...output };

  if ("text" in output) {
    normalized.text = normalizeMultilineString(output.text);
  }
  if ("traceback" in output) {
    const tb = output.traceback;
    normalized.traceback = Array.isArray(tb)
      ? tb
      : typeof tb === "string"
        ? tb.split("\n")
        : [];
  }

  return normalized;
}

/**
 * Ensures `cell_type` is one of the known enum values.
 */
function normalizeCellType(raw: unknown): CellType {
  if (raw === "code") return CellType.CODE;
  if (raw === "markdown") return CellType.MARKDOWN;
  if (raw === "raw") return CellType.RAW;
  return CellType.RAW;
}

/**
 * Jupyter notebooks allow `source` to be either a single string or a string
 * array. This normalizes it to the string-array format used internally.
 */
function normalizeCellSource(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === "string" ? item : String(item)));
  }
  if (typeof raw === "string") {
    if (raw === "") return [""];
    return raw.split("\n").map((line, i, arr) =>
      i === arr.length - 1 ? line : line + "\n"
    );
  }
  return [""];
}

/**
 * Creates a placeholder cell that represents a corrupted cell.
 * The error is stored in `metadata.orion._parseError` so the UI can display it.
 */
function createErrorCell(errorMessage: string, rawContent: string): NotebookCellType {
  return {
    cell_type: CellType.RAW,
    source: rawContent ? [rawContent] : [""],
    metadata: {
      orion: {
        _parseError: errorMessage,
      },
    },
  };
}

/**
 * Attempts to extract and parse individual cells from a corrupted notebook JSON
 * string. Uses brace-matching to find cell boundaries within the `"cells"` array.
 *
 * This is a best-effort recovery mechanism when `JSON.parse()` fails on the
 * full content.
 */
function recoverCellsFromCorruptedJSON(content: string): NotebookCellType[] {
  const cells: NotebookCellType[] = [];

  const cellsArrayStart = content.indexOf('"cells"');
  if (cellsArrayStart === -1) return cells;

  const arrayOpenBracket = content.indexOf("[", cellsArrayStart);
  if (arrayOpenBracket === -1) return cells;

  let pos = arrayOpenBracket + 1;

  while (pos < content.length) {
    // Skip whitespace and commas between cells
    while (pos < content.length && /[\s,]/.test(content[pos])) pos++;

    if (pos >= content.length || content[pos] === "]") break;

    if (content[pos] === "{") {
      const cellStart = pos;
      const cellEnd = findMatchingBrace(content, pos);

      if (cellEnd === -1) {
        // Unmatched brace: take whatever is left and create an error cell
        const fragment = content.slice(cellStart);
        cells.push(
          createErrorCell("Corrupted cell: unmatched brace", fragment)
        );
        break;
      }

      const cellStr = content.slice(cellStart, cellEnd + 1);
      try {
        const parsed = JSON.parse(cellStr);
        cells.push(normalizeCell(parsed, cells.length));
      } catch {
        cells.push(
          createErrorCell(
            "Corrupted cell: invalid JSON",
            cellStr.length > 2000 ? cellStr.slice(0, 2000) + "..." : cellStr
          )
        );
      }

      pos = cellEnd + 1;
    } else {
      // Unexpected character; skip ahead to find next cell
      pos++;
    }
  }

  return cells;
}

/**
 * Finds the index of the matching closing brace for an opening brace,
 * properly accounting for nested braces and JSON string literals.
 */
function findMatchingBrace(content: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < content.length; i++) {
    const ch = content[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Attempts to recover top-level notebook metadata (nbformat, metadata, etc.)
 * from partially valid JSON content.
 */
function recoverNotebookMetadata(content: string): {
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
} {
  const defaults = { metadata: {} as Record<string, unknown>, nbformat: 4, nbformat_minor: 5 };

  try {
    const nbformatMatch = content.match(/"nbformat"\s*:\s*(\d+)/);
    if (nbformatMatch) {
      defaults.nbformat = parseInt(nbformatMatch[1], 10);
    }

    const nbformatMinorMatch = content.match(/"nbformat_minor"\s*:\s*(\d+)/);
    if (nbformatMinorMatch) {
      defaults.nbformat_minor = parseInt(nbformatMinorMatch[1], 10);
    }
  } catch {
    // Regex failures are non-critical
  }

  return defaults;
}

/**
 * Parses notebook JSON content into a NotebookType structure.
 *
 * When the content is valid JSON, each cell is individually validated and
 * normalized. When the content is corrupted (invalid JSON), a recovery
 * strategy extracts and parses cells individually so that non-corrupted cells
 * can still render.
 */
export function parseNotebook(content: string): NotebookType {
  if (!content) {
    return {
      cells: [],
      metadata: {},
      nbformat: 0,
      nbformat_minor: 0,
    };
  }

  // Fast path: try parsing the entire JSON document
  try {
    const notebook = JSON.parse(content);

    const rawCells = Array.isArray(notebook?.cells) ? notebook.cells : [];
    const normalizedCells = rawCells.map((raw: unknown, i: number) =>
      normalizeCell(raw, i)
    );

    return {
      cells: normalizedCells,
      metadata:
        notebook.metadata && typeof notebook.metadata === "object"
          ? notebook.metadata
          : {},
      nbformat: typeof notebook.nbformat === "number" ? notebook.nbformat : 4,
      nbformat_minor:
        typeof notebook.nbformat_minor === "number"
          ? notebook.nbformat_minor
          : 5,
    };
  } catch (jsonError) {
    console.warn(
      "Notebook JSON is corrupted, attempting cell-by-cell recovery:",
      jsonError
    );
  }

  // Slow path: recover cells individually from the corrupted JSON
  const cells = recoverCellsFromCorruptedJSON(content);
  const meta = recoverNotebookMetadata(content);

  if (cells.length === 0) {
    console.error(
      "Could not recover any cells from corrupted notebook"
    );
    return {
      cells: [
        createErrorCell(
          "This notebook file is corrupted and could not be parsed. The file may contain invalid JSON.",
          ""
        ),
      ],
      ...meta,
    };
  }

  return {
    cells,
    ...meta,
  };
}
