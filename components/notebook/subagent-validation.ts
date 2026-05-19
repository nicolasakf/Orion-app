import type { NotebookCellType, NotebookType } from "@/lib/types";
import { CellType } from "@/lib/types";

export interface SubagentNotebookValidation {
  issues: string[];
  cellIssues: Map<number, string>;
}

/** Returns true when a value is a plain object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns true when a notebook path opts into sub-agent settings via filename. */
export function isSubagentNotebookPath(filepath: string): boolean {
  const name = filepath.split("/").pop() ?? filepath;
  return name.toLowerCase().endsWith(".agent.ipynb");
}

/** Reads Orion sub-agent metadata from top-level notebook metadata. */
export function getSubagentMetadata(
  metadata: NotebookType["metadata"] | undefined,
): Record<string, unknown> | null {
  if (!metadata || !isRecord(metadata.orion)) return null;
  return isRecord(metadata.orion.subagent) ? metadata.orion.subagent : null;
}

/** Reads the configured sub-agent model id, or empty string for inheritance. */
export function getSubagentModelId(
  metadata: NotebookType["metadata"] | undefined,
): string {
  const subagent = getSubagentMetadata(metadata);
  return typeof subagent?.model === "string" ? subagent.model : "";
}

/** Returns true when the notebook sub-agent should be hidden from model-chosen delegation. */
export function getSubagentDisableModelInvocation(
  metadata: NotebookType["metadata"] | undefined,
): boolean {
  const subagent = getSubagentMetadata(metadata);
  return typeof subagent?.["disable-model-invocation"] === "boolean"
    ? subagent["disable-model-invocation"]
    : false;
}

/** Returns a notebook cell source string with surrounding whitespace removed. */
export function sourceText(cell: NotebookCellType | undefined): string {
  return Array.isArray(cell?.source) ? cell.source.join("").trim() : "";
}

/** Removes an optional expected markdown heading before validating body text. */
export function stripAllowedLeadingHeading(
  markdown: string,
  allowedHeadings: ReadonlySet<string>,
): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) return "";

  const firstLine = lines[firstContentIndex].trim();
  const heading = firstLine.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (!heading) return markdown.trim();

  const normalizedHeading = heading[1]
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ");
  if (!allowedHeadings.has(normalizedHeading)) return markdown.trim();

  firstContentIndex += 1;
  while (
    firstContentIndex < lines.length &&
    lines[firstContentIndex].trim().length === 0
  ) {
    firstContentIndex += 1;
  }

  return lines.slice(firstContentIndex).join("\n").trim();
}

/** Returns true when the first non-empty markdown line is an H1. */
export function startsWithH1(markdown: string): boolean {
  const firstNonEmptyLine = markdown
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  return /^#\s+.+/.test(firstNonEmptyLine?.trim() ?? "");
}

/** Checks the required first three cells for `.agent.ipynb` sub-agent notebooks. */
export function validateSubagentNotebookStructure(
  notebook: NotebookType | null,
): SubagentNotebookValidation {
  const issues: string[] = [];
  const cellIssues = new Map<number, string>();
  if (!notebook) return { issues, cellIssues };

  const firstCell = notebook.cells[0];
  if (!firstCell) {
    issues.push("Cell 0 is missing. Add a markdown cell with an H1 label.");
  } else if (firstCell.cell_type !== CellType.MARKDOWN) {
    const message =
      "Cell 0 must be a markdown cell with an H1 label, such as # Data Profiler.";
    issues.push(message);
    cellIssues.set(0, message);
  } else if (!startsWithH1(sourceText(firstCell))) {
    const message =
      "Cell 0 must start with an H1 label, such as # Data Profiler.";
    issues.push(message);
    cellIssues.set(0, message);
  }

  const secondCell = notebook.cells[1];
  if (!secondCell) {
    issues.push(
      "Cell 1 is missing. Add a markdown cell with the sub-agent description.",
    );
  } else if (secondCell.cell_type !== CellType.MARKDOWN) {
    const message = "Cell 1 must be a markdown description cell.";
    issues.push(message);
    cellIssues.set(1, message);
  } else {
    const description = stripAllowedLeadingHeading(
      sourceText(secondCell),
      new Set(["description"]),
    );
    if (!description) {
      const message =
        "Cell 1 needs a non-empty description after any optional Description heading.";
      issues.push(message);
      cellIssues.set(1, message);
    }
  }

  const thirdCell = notebook.cells[2];
  if (!thirdCell) {
    issues.push(
      "Cell 2 is missing. Add a markdown cell with the sub-agent system prompt.",
    );
  } else if (thirdCell.cell_type !== CellType.MARKDOWN) {
    const message = "Cell 2 must be a markdown system prompt cell.";
    issues.push(message);
    cellIssues.set(2, message);
  } else {
    const systemPrompt = stripAllowedLeadingHeading(
      sourceText(thirdCell),
      new Set(["system prompt", "system"]),
    );
    if (!systemPrompt) {
      const message =
        "Cell 2 needs a non-empty system prompt after any optional System Prompt heading.";
      issues.push(message);
      cellIssues.set(2, message);
    }
  }

  return { issues, cellIssues };
}
