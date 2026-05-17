/**
 * Notebook-defined subagent registry.
 *
 * Discovers `*.agent.ipynb` under `.agents/subagents` and `.orion/subagents`
 * at the Jupyter server root (user) and under `<workspace>/` (project).
 * **Default authoring** with other agents is `.agents/subagents`; `.orion/subagents`
 * is for Orion-specific overrides (same id). Merge order loads `.agents` before
 * `.orion` at each level, then user before project — so project `.orion` wins overall.
 */

import type { ContentsManager } from "@jupyterlab/services";
import { parseNotebook } from "@/lib/notebook/notebook-parser";
import { CellType, type NotebookCellType, type NotebookType } from "@/lib/types";
import type { SubagentDefinition, SubagentOptions } from "./types";

/** Relative to Jupyter server root. */
const AGENTS_SUBAGENT_DIR = ".agents/subagents";
/** Orion-specific overrides — merged after `AGENTS_SUBAGENT_DIR` at the same level. */
const ORION_SUBAGENT_DIR = ".orion/subagents";
const TMP_SEGMENT = "tmp";
const SUBAGENT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUBAGENT_NOTEBOOK_SUFFIX = ".agent.ipynb";

function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function sourceText(cell: NotebookCellType | undefined): string {
  return Array.isArray(cell?.source) ? cell.source.join("").trim() : "";
}

function extractH1(markdown: string): string | null {
  const firstNonEmptyLine = markdown
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  const match = firstNonEmptyLine?.match(/^#\s+(.+?)\s*$/);
  return match?.[1]?.trim() || null;
}

function stripLeadingHeading(markdown: string, allowedHeadings: ReadonlySet<string>): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) return "";

  const firstLine = lines[firstContentIndex].trim();
  const heading = firstLine.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (!heading) return markdown.trim();

  const normalizedHeading = heading[1].trim().toLowerCase().replace(/[-_]+/g, " ");
  if (!allowedHeadings.has(normalizedHeading)) return markdown.trim();

  firstContentIndex += 1;
  while (firstContentIndex < lines.length && lines[firstContentIndex].trim().length === 0) {
    firstContentIndex += 1;
  }

  return lines.slice(firstContentIndex).join("\n").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Returns true when a notebook filename opts into sub-agent discovery. */
export function isSubagentNotebookFilename(name: string): boolean {
  return name.toLowerCase().endsWith(SUBAGENT_NOTEBOOK_SUFFIX);
}

/** Derives the slash-command id from a `.agent.ipynb` filename. */
export function subagentNameFromNotebookFilename(name: string): string {
  return isSubagentNotebookFilename(name)
    ? name.slice(0, -SUBAGENT_NOTEBOOK_SUFFIX.length)
    : name.replace(/\.ipynb$/i, "");
}

/** Parses optional Orion runtime metadata from a sub-agent notebook. */
function parseSubagentOptions(metadata: NotebookType["metadata"]): SubagentOptions {
  const orion = isRecord(metadata.orion) ? metadata.orion : undefined;
  const subagent = orion && isRecord(orion.subagent) ? orion.subagent : undefined;
  const model = typeof subagent?.model === "string" && subagent.model.trim().length > 0
    ? subagent.model.trim()
    : undefined;
  const disableModelInvocation =
    typeof subagent?.["disable-model-invocation"] === "boolean"
      ? subagent["disable-model-invocation"]
      : false;

  return {
    ...(model ? { model } : {}),
    disableModelInvocation,
  };
}

export function buildSubagentTmpNotebookPath(args: {
  baseDirectory: string;
  name: string;
  runId: string;
  date?: Date;
}): string {
  const timestamp = (args.date ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const safeRunId = args.runId.replace(/[^a-zA-Z0-9-]/g, "");
  return joinPath(
    args.baseDirectory,
    TMP_SEGMENT,
    args.name,
    `${timestamp}-${safeRunId}.ipynb`
  );
}

export function parseSubagentNotebookDefinition(args: {
  name: string;
  location: string;
  baseDirectory: string;
  notebook: NotebookType;
  source: "user" | "project";
}): SubagentDefinition | null {
  const { name, location, baseDirectory, notebook, source } = args;
  if (!SUBAGENT_NAME_PATTERN.test(name)) return null;

  const firstCell = notebook.cells[0];
  const secondCell = notebook.cells[1];
  const thirdCell = notebook.cells[2];
  if (!firstCell || firstCell.cell_type !== CellType.MARKDOWN) return null;
  if (!secondCell || secondCell.cell_type !== CellType.MARKDOWN) return null;
  if (!thirdCell || thirdCell.cell_type !== CellType.MARKDOWN) return null;
  if (
    notebook.cells
      .slice(3)
      .some((cell) => cell.cell_type !== CellType.MARKDOWN && cell.cell_type !== CellType.CODE)
  ) {
    return null;
  }

  const label = extractH1(sourceText(firstCell));
  const description = stripLeadingHeading(
    sourceText(secondCell),
    new Set(["description"])
  );
  const systemPrompt = stripLeadingHeading(
    sourceText(thirdCell),
    new Set(["system prompt", "system"])
  );
  if (!label || !description || !systemPrompt) return null;

  return {
    name,
    label,
    description,
    systemPrompt,
    location,
    baseDirectory,
    notebook,
    source,
    options: parseSubagentOptions(notebook.metadata),
  };
}

async function getTextFile(contents: ContentsManager, path: string): Promise<string | null> {
  const file = await contents.get(path, { content: true });
  if (typeof file.content === "string") return file.content;
  if (file.content && typeof file.content === "object") return JSON.stringify(file.content);
  return null;
}

export class SubagentRegistry {
  private subagents: Map<string, SubagentDefinition> = new Map();
  private contentsManager: ContentsManager | null = null;
  private workspaceRoot = "";

  /**
   * Provide a ContentsManager and workspace root so notebook-defined subagents
   * can be discovered. Pass `null` when disconnected.
   */
  setContentsManager(manager: ContentsManager | null, workspaceRoot: string): void {
    this.contentsManager = manager;
    this.workspaceRoot = workspaceRoot;
  }

  /** Re-scan user- and project-level subagent notebooks from `.agents/subagents` and `.orion/subagents`. */
  async refresh(): Promise<void> {
    this.subagents.clear();
    if (!this.contentsManager) return;

    await this.mergeSubagentsFromDirectory(AGENTS_SUBAGENT_DIR, "user");
    await this.mergeSubagentsFromDirectory(ORION_SUBAGENT_DIR, "user");

    if (this.workspaceRoot) {
      await this.mergeSubagentsFromDirectory(
        joinPath(this.workspaceRoot, AGENTS_SUBAGENT_DIR),
        "project"
      );
      await this.mergeSubagentsFromDirectory(
        joinPath(this.workspaceRoot, ORION_SUBAGENT_DIR),
        "project"
      );
    }
  }

  private async mergeSubagentsFromDirectory(
    subagentsDir: string,
    source: "user" | "project"
  ): Promise<void> {
    const contents = this.contentsManager;
    if (!contents) return;

    try {
      const dir = await contents.get(subagentsDir, { content: true });
      if (dir.type !== "directory" || !Array.isArray(dir.content)) return;

      for (const entry of dir.content as Array<{ name: string; type: string; path?: string }>) {
        if (entry.type === "directory" && entry.name === TMP_SEGMENT) continue;
        if (!isSubagentNotebookFilename(entry.name)) continue;
        if (entry.type !== "notebook" && entry.type !== "file") continue;

        const name = subagentNameFromNotebookFilename(entry.name);
        const location = entry.path ?? joinPath(subagentsDir, entry.name);

        try {
          const raw = await getTextFile(contents, location);
          if (!raw) continue;

          const definition = parseSubagentNotebookDefinition({
            name,
            location,
            baseDirectory: subagentsDir,
            notebook: parseNotebook(raw),
            source,
          });
          if (definition) this.subagents.set(definition.name, definition);
        } catch {
          // Skip invalid or unreadable notebooks.
        }
      }
    } catch {
      // Directory missing or hidden by Jupyter configuration — skip.
    }
  }

  /** Return all available notebook-defined subagents. */
  getAll(): SubagentDefinition[] {
    return Array.from(this.subagents.values());
  }

  /** Look up a subagent by filename-stem id. */
  get(name: string): SubagentDefinition | undefined {
    return this.subagents.get(name);
  }
}
